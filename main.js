/*eslint-env node, es6*/

/* Module Description:
This module goes through all of the quicklinks and checks to see if the quicklinks to the quizzes 
or dropboxes are broken. If they are broken, the child module goes through them and repairs the link
*/

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.mdz

const canvas = require('canvas-wrapper');
const asyncLib = require('async');
const cheerio = require('cheerio');

//utilizing YUI module pattern
//https://stackoverflow.com/a/2613647/5646003
// var get_array = (() => {
//     var arr = [];

//     return {
//         push: (arg) => {
//             arr.push(arg);
//         },

//         length: () => {
//             return arr.length;
//         },

//         get: () => {
//             return arr;
//         }
//     };
// })();
var arr = [];

module.exports = (course, stepCallback) => {
    course.message('repair-quicklinks child module launched.');

    /**************************************************
     * retrieveFiles
     *
     * This function retrieves all of the pages in the
     * course and goes through them. On each page, it calls
     * the htmlChecker, which will then analyze the html.
    **************************************************/
    function retrieveFiles(functionCallback) {
        getDropboxName();

        canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages`, (err, pages) => {
            //begin process of parsing
            htmlChecker(pages, (htmlCheckerErr) => {
                if (htmlCheckerErr) {
                    functionCallback(htmlCheckerErr);
                    return;
                } else {
                    functionCallback(null, course);
                }
            });
        });
    }

    /**************************************************
     * htmlChecker
     *
     * @param pages -- string
     *
     * This function goes through and analyzes each 
     * link on the page. If it finds a dropbox or quiz 
     * link, it will call the appropriate function to
     * repair the link.
    **************************************************/
    function htmlChecker(pages, functionCallback) {
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
                        //check to see if the link contains the dropbox link
                        //all broke dropbox links contains the word drop_box
                        if ($(link).attr('href').indexOf('drop_box') != -1) {
                            //we found a dropbox quicklink. 
                            fixDropbox(p[0], (err) => {
                                if (err) {
                                    eachSeriesCallback(err);
                                }
                            });
                        }
                    });
                    eachSeriesCallback(null);
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
     * @param page -- string
     *
     * This function goes through the link and retrieves
     * the name/id from the array (which is built through the 
     * dropbox_d2l.xml). This function then makes an api
     * call to retrieve correct url and replace the 
     * link. 
    **************************************************/
    function fixDropbox(page, functionCallback) {
        var newUrl = '';

        course.message(`Found broken link in ${page.title}`);

        //load the html and grab all links.
        var $ = cheerio.load(page.body);
        var links = $('a');
        $(links).each((i, link) => {
            var url = $(link).attr('href');

            if (url.indexOf('drop_box') != -1) {
                //get dropbox number
                srcUrl = url.split('drop_box_').pop();
                
                //get names of dropbox for search_term part of assignments api.
                arr.forEach((obj) => {
                    if (obj.id === srcUrl) {
                        var tempName = obj.name.split(' ').join('%20');
                        console.log(`Obj name: ${tempName}`);
                        console.log(`URL: api/v1/courses/${course.info.canvasOU}/assignments?search_term=${tempName}`);
                        //search term part of the api allows us to retrieve the list of assignments that has that name. 
                        //here, we extract the html_url from this and return it so it can be properly embedded in the html.

                        //the problem happens here
                        canvas.get(`api/v1/courses/${course.info.canvasOU}/assignments?search_term=${tempName}`, (err, info) => {
                            if (err) {
                                console.log(`ERROR: ${err}`);
                                functionCallback(err);
                                return;
                            } else {
                                console.log(`INFO: ${JSON.stringify(info)}`);
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

    /****************************************************************
     * replaceLink
     * 
     * @param badLink -- string
     * @param newLink -- string
     * @param $ -- object -- cheerio
     * @param pageUrl -- string
     * @param functionCallback
     * 
     * This function goes through and replaces all of the bad links with the correct link. 
     * If there are multiple instances of the same bad link through the page, this will
     * replace them all.
    ******************************************************************/
    function replaceLink(badLink, newLink, $, pageUrl, functionCallback) {
        //grab all a tags in html
        var links = $('a');

        //replace bad link with new one
        links.attr('href', (i, link) => {
            return link.replace(badLink, newLink);
        });

        course.message(`Link replacement completed. Initializing htmlInjection to update page.`);

        //the html has been fixed. call this function to push the changes online
        htmlInjection(pageUrl, $.html(), (err, results) => {
            if (err) {
                functionCallback(err);
            } else {
                functionCallback(null, results);
            }
        });
    }

    /****************************************************************
     * htmlInjection
     * 
     * @param pageUrl -- string
     * @param html -- string
     * @param functionCallback
     * 
     * This function makes an api call to Canvas and utilizes the update
     * page to update the body, which essentially holds the html.
    ******************************************************************/
    function htmlInjection(pageUrl, html, functionCallback) {
        canvas.put(`/api/v1/courses/${course.info.canvasOU}/pages/${pageUrl}`, {
            'wiki_page': {
                'body': html //body contains a string of the html code.
            }
        }, (err, results) => {
            if (err) {
                functionCallback(err);
                return;
            } else {
                course.message(`Successfully injected new html - url: ${pageUrl}`);
                functionCallback(null, results);
            }
        });

    }

    /****************************************************************
     * getDropboxName
     * 
     * This function retrieves the dropbox_d2l.xml which holds all of
     * the dropbox information. This function parses the xml file and 
     * stores all of the information in an array.
    ******************************************************************/
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
            
            arr.push(obj);
        });
    }

    /****************************************************************
     * getDropboxFile
     * 
     * This function simply retrieves the dropbox_d2l.xml from the 
     * course.content.
    ******************************************************************/
    function getDropboxFile() {
        var file = course.content.find((file) => {
            return file.name === `dropbox_d2l.xml`;
        });

        return file;
    }

    /************************************************************************************
      *                                    START HERE                                  
    *************************************************************************************/
    //stepCallback(null, course) is always called regardless of the success of this child module
    retrieveFiles((err, results) => {
        if (err) {
            course.error(err);
            stepCallback(null, course);
        } else {
            course.message(`Successfully completed repair-quicklinks child module`);
            stepCallback(null, course);
        }
    });
};