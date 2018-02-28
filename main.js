/*eslint-env node, es6*/

/* Module Description:
This module goes through all of the quicklinks and checks to see if the quicklinks to the dropboxes are broken. 
If they are broken, the child module goes through them and repairs the broken quicklink.
*/

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.md

const canvas = require('canvas-wrapper');
const asyncLib = require('async');
const cheerio = require('cheerio');
const _ = require('underscore');

var xmlAssignments = [];

module.exports = (course, stepCallback) => {
    course.message('repair-quicklinks child module launched.');

    /**************************************************
     * retrieveFiles
     * 
     * @param retrieveFilesCallback
     *
     * This function retrieves all of the pages in the
     * course and goes through them. On each page, it calls
     * the htmlChecker, which will then analyze the html.
    **************************************************/
    function retrieveFiles(retrieveFilesCallback) {
        canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages`, (err, pages) => {
            if (err) {
                retrieveFilesCallback(err);
                return;
            } else {
                course.message(`Executing page analysis stage...`);
                retrieveFilesCallback(null, pages);
            }
        });
    }

    /****************************************************************
     * findDropboxes
     * 
     * @param page -- string
     * @param functionCallback
     * 
     * This function goes through and ensures that the links in the 
     * webpage consists of dropbox links. If it does, it pushes the 
     * page to an array to be parsed through later.
    ******************************************************************/
    function findDropboxes(pages, findDropboxesCallback) {
        course.message(`Processing course pages.`);

        var dropboxBool = false;
        var pagesWithDropboxLinks = [];

        asyncLib.each(pages, (page, eachCallback) => {
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
                if (err) {
                    eachCallback(err);
                    return;
                } else {
                    //load html and grab all links inside the html
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

                        //dropbox has been found so let's push the page to the array and 
                        //move on for the time being.
                        if (dropboxBool) {
                            course.message(`Identified page with dropbox link(s)`);
                            pagesWithDropboxLinks.push(p);

                            dropboxBool = false;
                            eachCallback(null);
                        }
                        else {
                            eachCallback(null);
                        }
                    }
                }
            });
        }, (err) => {
            if (err) {
                findDropboxesCallback(err);
                return;
            }
                
            findDropboxesCallback(null, pagesWithDropboxLinks);
        });
    }

    /****************************************************************
     * parsePages
     * 
     * @param pagesWithDropboxLinks - array => pages
     * @param parsePagesCallback
     * 
     * This function goes through each page that has dropbox links and
     * analyzes the html content. It prepares the information needed 
     * to find the correct link through Canvas.
    ******************************************************************/
    function parsePages(pagesWithDropboxLinks, parsePagesCallback) {
        var pagesToLookInto = [];
        
        course.message(`Now parsing ${pagesWithDropboxLinks.length} pages that contains dropbox link(s)`);

        asyncLib.eachSeries(pagesWithDropboxLinks, (page, eachSeriesCallback) => {
            course.message(`Analyzing ${page[0].title}`);

            //load html and grab all of the links
            var $ = cheerio.load(page[0].body);
            var links = $('a');
            
            asyncLib.each($(links), (link, eachCallback) => {
                var url = $(link).attr('href');

                if (url.includes('drop_box_')) {
                    //get id from the bad link - returns int
                    srcId = url.split('drop_box_').pop();

                    asyncLib.each(xmlAssignments, (xmlAssignment, innerEachCallback) => {
                        if (srcId === xmlAssignment.id) {
                            pagesToLookInto.push({
                                'srcId': srcId,         //source id of bad link
                                'd2l': xmlAssignment,   //xml that contains good source id 
                                'url': url,             //url so we can retrieve body's html through api
                                'page': page            //additional information about the page
                            });

                            innerEachCallback(null);
                        } else {
                            innerEachCallback(null);
                        }
                    }, (innerEachSeriesErr) => {
                        if (innerEachSeriesErr) {
                            eachCallback(innerEachSeriesErr);
                        } else {
                            eachCallback(null);
                        }
                    });
                } else {
                    eachCallback(null);
                }
            }, (eachErr) => {
                if (eachErr) {
                    eachSeriesCallback(eachErr);
                } else {
                    eachSeriesCallback(null);
                }
            });
        }, (eachSeriesErr) => {
            if (eachSeriesErr) {
                parsePagesCallback(eachSeriesErr);
                return;
            }
            
            parsePagesCallback(null, pagesToLookInto);
        });
    }

    /****************************************************************
     * getCorrectLinks
     * 
     * @param pagesToLookInto -- array => srcId, d2l, url, page
     * @param getCorrectLinksCallback
     * 
     * This function goes through the page and retrieves all of the 
     * correct links for the dropbox links.
    ******************************************************************/
    function getCorrectLinks(pagesToLookInto, getCorrectLinksCallback) {
        var brokenLinks = [];

        asyncLib.each(pagesToLookInto, (page, eachCallback) => {
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments?search_term=${page.d2l.name}`, (getErr, assignments) => {
                if (getErr) {
                    eachCallback(getErr);
                    return;
                } else {
                    //there are more than one assignment returned
                    if (assignments.length > 1) {
                        //iterate through each quiz and see if the quiz actually matches what we are looking
                        //for so we can get the correct link
                        assignments.forEach((assignment) => {
                            if (assignment.name === page.d2l.name) {
                                //link to replace the bad link
                                newUrl = assignment.html_url;

                                //create an object of things we need
                                brokenLinks.push({
                                    'badLink': page.url, //current url
                                    'newLink': newUrl,   //url that we will update the badLink with
                                    'page': page.page[0] //html of page that we will update with newLink
                                });
                            }
                        });

                        eachCallback(null);
                    //here, we know that there are only one quiz
                    } else {
                        //only one assignment returned. let's check the names to make sure
                        //that we got the correct one.
                        if (assignments[0].name === page.d2l.name) {
                            //link to replace the bad link
                            newUrl = assignments[0].html_url;

                            //create an object of things we need
                            brokenLinks.push({
                                'badLink': page.url, //current url
                                'newLink': newUrl,   //url that we will update the badLink with
                                'page': page.page[0] //html of page that we will update with newLink
                            });
                        }

                        eachCallback(null);
                    }
                }
            });
        }, (err) => {
            if (err) {
                getCorrectLinksCallback(err);
                return;
            }

            getCorrectLinksCallback(null, brokenLinks);
        });
    }

    /****************************************************************
     * cleanUpArray
     * 
     * @param brokenLinks -- array of objects => badLink, newLink, page
     * 
     * This function goes through and formats the array to the way it needs
     * to be before making the changes.
     * FORMAT: By the end of this function, the format of the array looks
     * like this: 
     * [
     *   // each array is for a certain page
     *   [
     *      // objects here for everything inside a page
     *   ],
     *   [
     *      // more objects
     *   ]
     * ]
    ******************************************************************/
    function cleanUpArray(brokenLinks) {
        //breaks the array into dictionaries based on the page.url
        //this helps ensure that each object inside the main object 
        //is only for one page. 
        //Additional information: http://underscorejs.org/#groupBy
        newBrokenLinks = _.groupBy(brokenLinks, (item) => {
            return item.page.url;
        });

        //converts the dictionary into an array of arrays to make it easier
        //to parse. Yay for functional programming.
        //keys() return enumerable objects 
        return Object.keys(newBrokenLinks).map((key) => {
            return newBrokenLinks[key];
        });
    }

    /****************************************************************
     * replaceLinks
     * 
     * @param brokenLinks -- array of objects => badLink, newLink, page
     * @param replaceLinkCallback
     * 
     * This function goes through and replaces all of the bad links with the correct links. 
     * If there are multiple instances of the same bad link through the page, this will
     * replace them all.
    ******************************************************************/
    function replaceLinks(brokenLinks, replaceLinkCallback) {
        var updatedBrokenLinksArray = cleanUpArray(brokenLinks);

        asyncLib.each(updatedBrokenLinksArray, (updatedBrokenLink, eachCallback) => {
            var urlToUpdate = updatedBrokenLink[0].page.url;
            var $ = cheerio.load(updatedBrokenLink[0].page.body);
            var links = $('a');

            //update all of the bad links with the correct links.
            //if there are multiple of the same link, this will go 
            //through them all and replace them as well.
            updatedBrokenLink.forEach((item) => {
                //replace bad link with new one
                links.attr('href', (i, link) => {
                    return link.replace(item.badLink, item.newLink);
                });

                //logging for report
                course.log(`replace-dropbox-quicklinks`, {
                    'badLink': item.badLink,
                    'newLink': item.newLink,
                    'page': urlToUpdate
                });
            });

            //since the page has now been updated to contain the 
            //correct links, the html is now injected to the course
            //before moving on.
            htmlInjection(urlToUpdate, $.html(), (htmlInjectionErr) => {
                if (htmlInjectionErr) {
                    eachCallback(htmlInjectionErr);
                    return;
                }

                eachCallback(null);
            });
        }, (eachOfErr) => {
            if (eachOfErr) {
                replaceLinkCallback(eachOfErr);
                return;
            } 

            replaceLinkCallback(null);
            return;
        });
    }

    /****************************************************************
     * htmlInjection
     * 
     * @param pageUrl -- string
     * @param html -- string
     * @param htmlInjectionCallback
     * 
     * This function makes an api call to Canvas and utilizes the update
     * page to update the body's html
    ******************************************************************/
    function htmlInjection(pageUrl, html, htmlInjectionCallback) {
        canvas.put(`/api/v1/courses/${course.info.canvasOU}/pages/${pageUrl}`, {
            'wiki_page': {
                'body': html //body contains a string of the html code.
            }
        }, (err, results) => {
            if (err) {
                htmlInjectionCallback(err);
                return;
            }
                
            course.message(`Successfully injected new html in url: ${pageUrl}`);
            htmlInjectionCallback(null);
        });

    }

    /****************************************************************
     * getDropboxName
     * 
     * @param getDropboxNameCallback
     * 
     * This function retrieves the dropbox_d2l.xml which holds all of
     * the dropbox information through a different function. This 
     * function then parses the xml file and stores all of the 
     * information in an array.
    ******************************************************************/
    function getDropboxName(getDropboxNameCallback) {
        //retrieve the dropbox_d2l.xml file
        var dropbox = getDropboxFile();
        
        //checking to see if the dropbox xml really has been found
        if (typeof dropbox != "undefined") {
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

            getDropboxNameCallback(null);
        } else {
            getDropboxNameCallback(Error('ERROR: File does not exist.'));
        }
    }

    /****************************************************************
     * getDropboxFile
     * 
     * This function retrieves the dropbox_d2l.xml from the 
     * course.content so it can be parsed.
    ******************************************************************/
    function getDropboxFile() {
        var file = course.content.find((file) => {
            return file.name === `dropbox_d2l.xml`;
        });

        return file;
    }

    /****************************************************************
     * beginProcess
     * 
     * This function acts as a driver for the program. It performs the
     * waterfall function to iterate through all of the functions to
     * get the job done. 
    ******************************************************************/
    function beginProcess() {
        var functions = [
            getDropboxName,
            retrieveFiles,
            findDropboxes,
            parsePages,
            getCorrectLinks,
            replaceLinks
        ];

        asyncLib.waterfall(functions, (waterfallErr) => {
            if (waterfallErr) {
                course.error(waterfallErr);
                return;
            }

            course.message(`Successfully completed repair-quicklinks child module`);
            stepCallback(null, course);
        });  
    }

    beginProcess();
};