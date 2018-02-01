/*eslint-env node, es6*/

/* Module Description:
This module goes through all of the quicklinks and checks to see if the quicklinks to the quizzes 
or dropboxes are broken. If they are broken, the child module goes through them and repairs the link
*/

const canvas = require('canvas-wrapper');
const asyncLib = require('async');
const cheerio = require('cheerio');

//utilizing YUI module pattern
//https://stackoverflow.com/a/2613647/5646003
var get_array = (() => {
    var arr = [];

    return {
        push: (arg) => {
            arr.push(arg);
        },

        get_length: () => {
            return arr.length;
        },

        get: () => {
            return arr;
        }
    };
})();

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.md

//PROCESS:
//1. Get HTML from Pages, Quizzes, Assignments and Discussion Boards
//2. Sort through & find bad quicklinks
//3. Get ID from bad link (drop_box_144) ==> you want 144
//4. Get assignment name from dropbox_d2l.xml using ID
//5. Make API call to Canvas w/ search term of assignment name
//6. Use returned assignment's ID to build new link
//7. Update HTML w/ new link

module.exports = (course, stepCallback) => {
    course.message('repair-quicklinks child module launched.');

    //this function goes through the course and retrieves all of the pages 
    //then traverses through all of the pages
    function retrieveFiles(course, functionCallback) {
        getDropboxName();

        canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages`, (err, pages) => {
            //begin process of parsing
            htmlChecker(course, pages, (htmlCheckerErr) => {
                if (htmlCheckerErr) {
                    functionCallback(htmlCheckerErr);
                    return;
                } else {
                    functionCallback(null, course);
                }
            });
        });
    }

    //this function goes throug the html and extracts all of the dropbox links.
    function htmlChecker(course, pages, functionCallback) {
        asyncLib.eachSeries(pages, (page, eachSeriesCallback) => {
            //p is received as a one-element array consisting of a Page object
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
                if (err) {
                    eachSeriesCallback(err);
                    return;
                } else {
                    course.message(`Analyzing ${p[0].title}...`);

                    //load the html and grab all of the links
                    var $ = cheerio.load(p[0].body);
                    links = $('a');

                    //iterate through the links.
                    $(links).each((i, link) => {
                        //all dropbox links contain the word 'drop_box'
                        if ($(link).attr('href').indexOf('drop_box') != -1) {
                            //we found a dropbox quicklink. 
                            fixDropbox(course, p[0], (err) => {
                                if (err) {
                                    eachSeriesCallback(err);
                                }
                            });
                        }
                    });
                    eachSeriesCallback(null, course);
                }
            });
        }, (err) => {
            if (err) {
                functionCallback(err);
                return;
            }
        });
    }

    /**************************************************
    * fixDropbox
    *
    * This function goes through the link and retrieves
    * the name/id from the array (which is built through the 
    * dropbox_d2l.xml). This function then makes an api
    * call to retrieve correct url and replace the 
    * link. 
    **************************************************/
    function fixDropbox(course, page, functionCallback) {
        var newUrl = '';

        course.message(`Found error in ${page.title}`);

        var $ = cheerio.load(page.body);
        var links = $('a');
        $(links).each((i, link) => {
            var url = $(link).attr('href');

            if (url.indexOf('drop_box') != -1) {
                //get dropbox number
                srcUrl = url.split('drop_box_').pop();
                
                //get names of dropbox for search_term part of assignments api.
                get_array.get.forEach((obj) => {
                    if (obj.id === srcUrl) {
                        //search term part of the api allows us to retrieve the list of assignments that has that name. 
                        //here, we extract the html_url from this and return it so it can be properly embedded in the html.
                        canvas.get(`api/v1/courses/${course.info.canvasOU}/assignments?search_term=${obj.name}`, (err, info) => {
                            if (err) {
                                functionCallback(err);
                                return;
                            } else {
                                //some assignments have similar names so more than one quizzes gets returned
                                //this takes care of that situation
                                //TODO: ensure that the newUrl is correct 
                                //TODO: call replaceLink() to replace the bad link with the good link in the HTML using cheerio.
                                if (info.length > 1) {
                                    course.message('There are more than one quizzes with a similar name');
                                    info.forEach((quiz) => {
                                        if (quiz.name === name) {
                                            course.message('Found correct link.');
                                            newUrl = quiz.html_url;
                                            console.log(`Name: ${name}. New Url: ${newUrl}.`);
                                        }
                                    });
                                //here, we know that there are only one quiz
                                } else {
                                    if (quiz.name === name) {
                                        course.message('Found correct link.');
                                        newUrl = quiz.html_url;
                                        console.log(`Name: ${name}. New Url: ${newUrl}.`);
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    //TODO: fill this function to replace the link after the new url has been found.
    function replaceLink() {

    }

    //not being used at the moment.
    function retrieveLink(name, functionCallback) {
        console.log(`Name: ${name}`);

        
        
    }

    //not being used at the moment.
    function repairDropbox(course, page, functionCallback) {
        canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments`, (err, assignments) => {
            asyncLib.eachSeries(assignments, (assign, eachSeriesCallback) => {
                //all dropboxes have the submission type of 'online_upload'
                if (assign.submission_types.includes('online_upload')) {
                    //call lambda function to retrive html url
                    get_array.get.map((item) => {
                        getDropboxes(course, item.name, (err) => {
                            if (err) {
                                eachSeriesCallback(err);
                            } else {
                                eachSeriesCallback(null);
                            }
                        });
                    });
                }
            }, (err) => {
                if (err) {
                    functionCallback(err);
                    return;
                } else {
                    functionCallback(null, course);
                    return;
                }
            });
        });
    }

    //5. Make API call to Canvas w/ search term of assignment name
    //not being used at the moment.
    function getDropboxes(course, title, functionCallback) {
        canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments`, (err, dropboxes) => {
            asyncLib.each(dropboxes, (item, eachLimitCallback) => {
                if (err) {
                    eachLimitCallback(err);
                } else {
                    if (item.name === title) {
                        return item.html_url;
                    }
                }
            });
        }, (err) => {
            if (err) {
                functionCallback(err);
                return;
            } else {
                functionCallback(null);
                return;
            }
        });
    }

    //retrieve the dropbox names and store the results in the array
    function getDropboxName() {
        //retrieve the dropbox_d2l.xml file
        var dropbox = getDropboxFile();
        var $ = dropbox.dom;

        //iterate through the xml nodes and retrieve the id and name 
        //of each dropbox folder
        $('dropbox > folder').each((index, folder) => {
            var obj = {
                name: folder.attribs.name,
                id: folder.attribs.id
            };
            
            get_array.push(obj);
        });
    }

    //parse through the course.info file to get the .xml which contains the name/id of the dropboxes
    function getDropboxFile() {
        var file = course.content.find((file) => {
            return file.name === `dropbox_d2l.xml`;
        });

        return file;
    }

    function initiateWaterfall(course, functionCallback) {
        var functions = [
            asyncLib.constant(course),
            retrieveFiles
        ];

        asyncLib.waterfall(functions, (waterfallErr, results) => {
            if (waterfallErr) {
                functionCallback(waterfallErr);
                return;
            } else {
                functionCallback(null, course);
            }
        });
    }

    /************************************************************************************
     *                                     START HERE                                    *
     ************************************************************************************/
    initiateWaterfall(course, (waterfallErr, results) => {
        if (waterfallErr) {
            course.error(waterfallErr);
            stepCallback(null, course);
        } else {
            course.message(`Successfully completed repair-quicklinks child module`);
            stepCallback(null, course);
        }
    });
};