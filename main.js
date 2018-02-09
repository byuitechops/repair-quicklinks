/*eslint-env node, es6*/

/* Module Description:
This module goes through all of the quicklinks and checks to see if the quicklinks to the dropboxes are broken. 
If they are broken, the child module goes through them and repairs the broken quicklink.
*/

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.md

// TODO: Merge the multiple/single dropbox into one function and create a bool to determine whether to call
// a function or to add to array.

const canvas = require('canvas-wrapper');
const asyncLib = require('async');
const cheerio = require('cheerio');

var xmlAssignments = [];

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
            course.message(`Executing page analysis stage...`);

            //begin process of parsing
            htmlChecker(pages, (htmlCheckerErr) => {
                if (htmlCheckerErr) {
                    functionCallback(htmlCheckerErr);
                    return;
                } else {
                    console.log(`about to return 2`); 
                    functionCallback(null);
                    return;
                }
            });
        });
    }

    /****************************************************************
     * findDropboxes
     * 
     * @param page -- string
     * @param functionCallback
     * 
     * This function goes through and ensures that the links in the 
     * webpage consists of dropbox links.
    ******************************************************************/
    function findDropboxes(page, eachCallback) {
        dropboxBool = false;

        canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
            if (err) {
                eachCallback(err);
                return;
            } else {
                var $ = cheerio.load(p[0].body);
                var links = $('a');

                //checking for links
                if (links.length <= 0) {
                    eachCallback(null);
                //links exist
                } else {
                    //going through and checking each link to see if it is a dropbox
                    $(links).each((index, link) => {
                        //if dropbox is not present, it returns -1
                        if ($(link).attr('href').indexOf('drop_box') != -1) {
                            dropboxBool = true;
                        }
                    });

                    //dropbox has been found
                    if (dropboxBool) {
                        fixDropbox(p[0], (err) => {
                            if (err) {
                                eachCallback(err);
                            } else {
                                eachCallback(null);
                            }
                        });

                        dropboxBool = false;
                    }
                } 
            }
        });
    }

    /****************************************************************
     * htmlChecker
     * 
     * @param page -- string
     * @param functionCallback
     * 
     * This function performs as a driver for the dropbox functions in
     * the program. 
    ******************************************************************/
    function htmlChecker(pages, functionCallback) {
        var dropboxBool = false;

        asyncLib.each(pages, findDropboxes, (err) => {
            if (err) {
                functionCallback(err);
                return;
            } else {
                console.log(`About to return 1`);
                functionCallback(null);
                return;
            }
        });
    }

    /****************************************************************
     * findBrokenDropboxLinks
     * 
     * @param link -- string
     * @param functionCallback
     * 
     * This function goes through and finds the correct title and then
     * makes an API call to Canvas to retrieve the correct URL for the 
     * dropbox assignment.
    ******************************************************************/
    function findBrokenDropboxLinks(link, functionCallback) {
        var url = $(link).attr('href');

        //going through each link on the page
        if (url.indexOf('drop_box') != 1) {
            //get id
            srcId = url.split('drop_box_').pop();

            asyncLib.each(xmlAssignments, (xmlAssignment, eachCallback) => {
                if (srcId === xmlAssignment.id) {
                    //replace spaces with %20
                    var tempName = xmlAssignment.name.split(' ').join('%20');

                    //make api call
                    canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments?search_term=${tempName}`, (err, assignments) => {
                        if (err) {
                            eachCallback(err);
                            return;
                        } else {
                            //there are more than one assignment returned
                            if (assignments.length > 1) {
                                assignments.forEach((assignment) => {
                                    if (assignment.name === xmlAssignment.name) {
                                        course.message(`Found dropbox link.`);
                                        newUrl = assignment.html_url;

                                        brokenLinks.push({
                                            'badLink': url,
                                            'newLink': newUrl
                                        });
                                    }
                                });

                                eachCallback(null);

                                //here, we know that there are only one quiz
                            } else {
                                //only one assignment returned. let's check the names to make sure
                                //that we got the correct one.

                                if (assignments[0].name === xmlAssignment.name) {
                                    newUrl = assignments[0].html_url;
                                    brokenLinks.push({
                                        'badLink': url,
                                        'newLink': newUrl
                                    });
                                }

                                eachCallback(null);
                            }
                        }
                    });
                } else {
                    eachCallback(null);
                }
            }, (err) => {
                if (err) {
                    functionCallback(err);
                } else {
                    functionCallback(null);
                }
            })
        } else {
            functionCallback(null);
        }
    }

    /****************************************************************
     * fixDropbox
     * 
     * @param page -- webpage - string
     * @param functionCallback
     * 
     * This function goes through and calls the appropriate functions
     * to fix the dropboxes. All in all, this is the driver for the 
     * fixing of dropboxes.
    ******************************************************************/
    function fixDropbox(page, functionCallback) {
        var newUrl = '';
        var brokenLinks = [];
        var $ = cheerio.load(page.body);
        var links = $('a');
        
        asyncLib.each($(links), findBrokenDropboxLinks, (err) => {
            if (err) {
                functionCallback(err);
                return;
            } else {
                replaceLinks(brokenLinks, $, page.url, (err) => {
                    if (err) {
                        functionCallback(err);
                        return;
                    } else {
                        console.log(`functionCallback 1`);
                        functionCallback(null);
                        return;
                    }
                });
                console.log(`here1121212`);
            }
        });
    }

    /****************************************************************
     * replaceLinks
     * 
     * @param brokenLinks -- array of objects => badLink, newLink
     * @param $ -- object -- cheerio
     * @param pageUrl -- string
     * @param functionCallback
     * 
     * This function goes through and replaces all of the bad links with the correct links. 
     * If there are multiple instances of the same bad link through the page, this will
     * replace them all.
    ******************************************************************/
    function replaceLinks(brokenLinks, $, pageUrl, functionCallback) {
        //grab all a tags in html
        var links = $('a');

        brokenLinks.forEach((brokenLink) => {
            //replace bad link with new one
            links.attr('href', (i, link) => {
                return link.replace(brokenLink.badLink, brokenLink.newLink);
            });

            course.log(`replace-dropbox-quicklinks`, {
                'badLink': brokenLink.badLink,
                'newLink': brokenLink.newLink
            });                
        });

        course.message(`Link replacement completed. Initializing htmlInjection to update page.`);

        //the html has been fixed. call this function to push the changes online
        htmlInjection(pageUrl, $.html(), (err) => {
            if (err) {
                functionCallback(err);
            } else {
                functionCallback(null);
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
                course.message(`Successfully injected new html in url: ${pageUrl}`);
                functionCallback(null);
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
            
            xmlAssignments.push(obj);
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
    // stepCallback(null, course) is always called regardless of the success of this child module
    // begin the process..
    retrieveFiles((err) => {
        if (err) {
            course.error(err);
            stepCallback(null, course);
        } else {
            course.message(`Successfully completed repair-quicklinks child module`);
            stepCallback(null, course);
        }
    });
};