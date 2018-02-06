/*eslint-env node, es6*/

/* Module Description:
This module goes through all of the quicklinks and checks to see if the quicklinks to the dropboxes are broken. 
If they are broken, the child module goes through them and repairs the broken quicklink.
*/

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.mdz

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
            //array consisting of broken links
            var htmlArray = [];

            //p is received as a one-element array consisting of a Page object
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
                if (err) {
                    eachSeriesCallback(err);
                    return;
                } else {
                    //load the html and grab all of the links
                    var $ = cheerio.load(p[0].body);
                    links = $('a');

                    //iterate through the links.
                    if (links.length > 0) {

                        $(links).each((i, link) => {
                            //check to see if the link contains the dropbox link
                            //all broke dropbox links contains the word drop_box
                            if ($(link).attr('href').indexOf('drop_box') != -1) {
                                console.log(`Found dropbox link in ${p[0].title}`);

                                // we found a dropbox quicklink. 
                                htmlArray.push(p[0]);
                            }
                        });

                        //multipe dropbox links have been found on the page
                        if (htmlArray.length > 1) {
                            fixMultipleDropbox(htmlArray, (err) => {
                                if (err) {
                                    eachSeriesCallback(err);
                                } else {
                                    eachSeriesCallback(null);
                                }
                            });
                        //only one dropbox link has been found
                        } else if (htmlArray.length > 0) {
                            fixSingleDropbox(htmlArray, (err) => {
                                if (err) {
                                    eachSeriesCallback(err);
                                } else {
                                    eachSeriesCallback(null);
                                }
                            });
                        //no dropbox links has been found.
                        } else {
                            eachSeriesCallback(null);
                        }
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

    /**************************************************
     * fixMultipleDropbox
     *
     * @param htmlArr -- array of page objects
     *
     * This function goes through the link and retrieves
     * the name/id from the array (which is built through the 
     * dropbox_d2l.xml). This function then makes an api
     * call to retrieve correct url and replace the 
     * link. This function will only be called if there
     * are multiple dropboxes in the htmlArr.
    **************************************************/
    function fixMultipleDropbox(htmlArr, functionCallback) {
        var brokenArr = [];
        

        course.message(`Multiple Dropboxes: Found ${htmlArr.length} broken links`);

        asyncLib.eachSeries(htmlArr, (page, eachSeriesCallback) => {
            var $ = cheerio.load(page.body);
            var links = $('a');

            asyncLib.eachSeries($(links), (link, eachCallback) => {
                var url = $(link).attr('href');

                if (url.indexOf(`drop_box`) != -1) {
                    course.message(`fixMultipleDropbox: found broken link`);

                    //get id
                    srcId = url.split('drop_box_').pop();

                    asyncLib.eachSeries(xmlAssignments, (obj, innerSeriesCallback) => {
                        if (srcId === obj.id) {
                            var tempName = obj.name.split(' ').join('%20');

                            canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments?search_term=${tempName}`, (err, assignments) => {
                                if (err) {
                                    innerSeriesCallback(err);
                                } else {
                                    //there are more than one assignment returned
                                    if (assignments.length > 1) {
                                        assignments.forEach((assignment) => {
                                            if (assignment.name === obj.name) {
                                                newUrl = assignment.html_url;
                                                brokenArr.push({
                                                    'badLink': url,
                                                    'newLink': newUrl
                                                });
                                            }
                                        });
                                        //here, we know that there are only one quiz
                                    } else {
                                        //only one assignment returned. let's check the names to make sure
                                        //that we got the correct one.

                                        if (assignments[0].name === obj.name) {
                                            newUrl = assignments[0].html_url;
                                            brokenArr.push({
                                                'badLink': url,
                                                'newLink': newUrl
                                            });
                                        }
                                    }
                                }
                            });
                        } else {
                            innerSeriesCallback(null);
                        }
                    }, (err) => {
                        if (err) {
                            eachCallback(err);
                        } else {
                            eachCallback(null);
                        }
                    });
                }
            }, (err) => {
                if (err) {
                    eachSeriesCallback(err);
                } else {
                    eachSeriesCallback(null);
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

    /**************************************************
     * fixSingleDropbox
     *
     * @param htmlArr -- array of page objects
     *
     * This function goes through the link and retrieves
     * the name/id from the array (which is built through the 
     * dropbox_d2l.xml). This function then makes an api
     * call to retrieve correct url and replace the 
     * link. This function will only be called if there
     * is a single dropbox in the htmlArr.
    **************************************************/
    function fixSingleDropbox(htmlArr, functionCallback) {
        var newUrl = '';

        course.message(`Single Dropbox: Found ${htmlArr.length} broken links.`);

        asyncLib.eachSeries(htmlArr, (page, eachSeriesCallback) => {
            var $ = cheerio.load(page.body);
            var pageUrl = page.url;
            var links = $('a');

            asyncLib.eachSeries($(links), (link, eachCallback) => {
                var url = $(link).attr('href');

                if (url.indexOf('drop_box') != -1) {
                    course.message(`fixSingleDropbox: found broken link`);
                    
                    srcUrl = url.split('drop_box_').pop(); //get id

                    asyncLib.eachSeries(xmlAssignments, (obj, innerSeriesCallback) => {
                        //compare ids
                        if (obj.id === srcUrl) {
                            //replace spaces with %20
                            var tempName = obj.name.split(' ').join('%20');

                            //make api call
                            canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments?search_term=${tempName}`, (err, assignments) => {
                                if (err) {
                                    innerSeriesCallback(err);
                                    return;
                                } else {
                                    var body = cheerio.load(page.body);

                                    //there are more than one assignment returned
                                    if (assignments.length > 1) {
                                        assignments.forEach((assignment) => {
                                            if (assignment.name === obj.name) {
                                                newUrl = assignment.html_url;
                                                replaceLink(url, newUrl, body, pageUrl, (err, results) => {
                                                    if (err) {
                                                        innerSeriesCallback(err);
                                                    } else {
                                                        innerSeriesCallback(null);
                                                    }
                                                });
                                            }
                                        });
                                     //here, we know that there are only one quiz
                                    } else {
                                        //only one assignment returned. let's check the names to make sure
                                        //that we got the correct one.

                                        if (assignments[0].name === obj.name) {
                                            newUrl = assignments[0].html_url;
                                            replaceLink(url, newUrl, body, pageUrl, (err, results) => {
                                                if (err) {
                                                    innerSeriesCallback(err);
                                                } else {
                                                    innerSeriesCallback(null);
                                                }
                                            });
                                        }
                                    }
                                }
                            });
                        } else {
                            innerSeriesCallback(null);
                        }
                    }, (err) => {
                        if (err) {
                            eachCallback(err);
                        } else {
                            eachCallback(null);
                        }
                    });
                } else {
                    eachCallback(null);
                }
            }, (err) => {
                if (err) {
                    eachSeriesCallback(err);
                } else {
                    eachSeriesCallback(null);
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

    /****************************************************************
     * replaceMultipleLinks
     * 
     * @param brokenArr -- array of objects => badLink, newLink
     * @param $ -- object -- cheerio
     * @param pageUrl -- string
     * @param functionCallback
     * 
     * This function goes through and replaces all of the bad links with the correct links. 
     * If there are multiple instances of the same bad link through the page, this will
     * replace them all.
    ******************************************************************/
    function replaceMultipleLinks(brokenArr, $, pageUrl, functionCallback) {
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
                course.message(`Successfully injected new html in url: ${pageUrl}`);
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