/*eslint-env node, es6*/

/* Module Description */

/* Put dependencies here */

/* Include this line only if you are going to use Canvas API */
const canvas = require('canvas-wrapper');
const asyncLib = require('async');
const cheerio = require('cheerio');

/* Variables */
var arr = [];

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.md

//1. Get HTML from Pages, Quizzes, Assignments and Discussion Boards
//2. Sort through & find bad quicklinks
//3. Get ID from bad link (drop_box_144) ==> you want 144
//4. Get assignment name from dropbox_d2l.xml using ID
//5. Make API call to Canvas w/ search term of assignment name
//6. Use returned assignment's ID to build new link
//7. Update HTML w/ new link
module.exports = (course, stepCallback) => {
    course.message('repair-quicklinks child module launched.');

    //this function goes through the course and retrieves then traverses through all of the files
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

    //this function goes throug hte html and extracts all of the dropbox links.
    function htmlChecker(course, pages, functionCallback) {
        asyncLib.eachSeries(pages, (page, eachSeriesCallback) => {
            //p is received as a one-element array consisting of a Page object
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
                if (err) {
                    eachSeriesCallback(err);
                    return;
                } else {
                    //load the html and grab all of the links
                    var $ = cheerio.load(p[0].body);
                    links = $('a');
                    $(links).each((i, link) => {
                        console.log(`Link: ${JSON.stringify($(link).attr('href'))}`);
                        //all dropbox links contain the word 'drop_box'
                        if ($(link).attr('href').indexOf('drop_box') != -1) {
                            console.log(`Found dropbox link`);
                            repairDropbox(course, p[0], (err) => {
                                if (err) {
                                    eachSeries(err);
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

    function repairDropbox(course, page, functionCallback) {
        canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments`, (err, assignments) => {
            asyncLib.eachSeries(assignments, (assign, eachSeriesCallback) => {
                //all dropboxes have the submission type of 'online_upload'
                console.log(JSON.stringify(assign));
                if (assign.submission_types.includes('online_upload')) {
                    //call lambda function to retrive html url
                    arr.map((item) => {
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
    //still needs work
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
        var dropbox = getDropboxFile();
        var $ = dropbox.dom;

        $('dropbox > folder').each((index, folder) => {
            var obj = {
                name: folder.attribs.name,
                id: folder.attribs.id
            };
            arr.push(obj);
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