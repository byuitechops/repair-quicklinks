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
const _ = require('underscore');

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
     * webpage consists of dropbox links.
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
     * @param pagesWithDropboxLinks
     * @param parsePagesCallback
     * 
     * 
    ******************************************************************/
    function parsePages(pagesWithDropboxLinks, parsePagesCallback) {
        var pagesToLookInto = [];
        
        course.message(`Now parsing ${pagesWithDropboxLinks.length} pages that contains dropbox link(s)`);

        asyncLib.eachSeries(pagesWithDropboxLinks, (page, eachSeriesCallback) => {
            course.message(`Analyzing ${page[0].title}`);
            var $ = cheerio.load(page[0].body);
            var links = $('a');
            
            asyncLib.each($(links), (link, innerEachSeriesCallback) => {
                var url = $(link).attr('href');

                if (url.includes('drop_box_')) {
                    //get id from the bad link
                    srcId = url.split('drop_box_').pop();

                    asyncLib.each(xmlAssignments, (xmlAssignment, eachCallback) => {
                        //somehow, the XML changed numbers and pushed all of the numbers up 3 which 
                        //makes this required. this shouldn't be required.. ¯\_(ツ)_/¯
                        // console.log(`Compare: ${((parseInt(srcId)) + 3).toString()} == ${xmlAssignment.id}`);
                        if (((parseInt(srcId)) + 3).toString() === xmlAssignment.id) {
                            pagesToLookInto.push({
                                'srcId': srcId,
                                'd2l': xmlAssignment,
                                'url': url,
                                'page': page
                            });

                            eachCallback(null);
                        } else {
                            eachCallback(null);
                        }
                    }, (innerEachSeriesErr) => {
                        if (innerEachSeriesErr) {
                            innerEachSeriesCallback(innerEachSeriesErr);
                        } else {
                            innerEachSeriesCallback(null);
                        }
                    });
                } else {
                    innerEachSeriesCallback(null);
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
     * @param pagesToLookInto
     * @param getCorrectLinksCallback
     * 
     * 
    ******************************************************************/
    function getCorrectLinks(pagesToLookInto, getCorrectLinksCallback) {
        var brokenLinks = [];
        asyncLib.each(pagesToLookInto, (page, eachCallback) => {
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/assignments?search_term=${page.d2l.name}`, (err, assignments) => {
                if (err) {
                    eachCallback(err);
                    return;
                } else {
                    //there are more than one assignment returned
                    if (assignments.length > 1) {
                        assignments.forEach((assignment) => {
                            if (assignment.name === page.d2l.name) {
                                //link to replace the bad link
                                newUrl = assignment.html_url;

                                //create an object of things we need
                                brokenLinks.push({
                                    'badLink': page.url,
                                    'newLink': newUrl,
                                    'page': page.page[0]
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
                                'badLink': page.url,
                                'newLink': newUrl,
                                'page': page.page[0]
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
     * 
    ******************************************************************/
    function cleanUpArray(brokenLinks) {
        //might not be necessary
        // brokenLinks.sort((a, b) => {
        //     return a.page.title - b.page.title;
        // });

        //breaks the array into dictionaries based on the page.url
        newBrokenLinks = _.groupBy(brokenLinks, (item) => {
            return item.page.url;
        });

        //converts the dictionary into an array of arrays
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
        // var updatedBrokenLinks = updatedBrokenLinksArray[0];

        // console.log(`UpdatedBrokenLinks: ${JSON.stringify(updatedBrokenLinks)}`);

        asyncLib.each(updatedBrokenLinksArray, (updatedBrokenLink, eachCallback) => {
            var urlToUpdate = updatedBrokenLink[0].page.url;
            var $ = cheerio.load(updatedBrokenLink[0].page.body);
            var links = $('a');

            updatedBrokenLink.forEach((item) => {
                //replace bad link with new one
                links.attr('href', (i, link) => {
                    return link.replace(item.badLink, item.newLink);
                });

                course.log(`replace-dropbox-quicklinks`, {
                    'badLink': item.badLink,
                    'newLink': item.newLink,
                    'page': urlToUpdate
                });
            });

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
     * page to update the body, which essentially holds the html.
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
     * This function retrieves the dropbox_d2l.xml which holds all of
     * the dropbox information. This function parses the xml file and 
     * stores all of the information in an array.
    ******************************************************************/
    function getDropboxName(getDropboxNameCalback) {
        //retrieve the dropbox_d2l.xml file
        var dropbox = getDropboxFile();
        
        //error checking
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

            getDropboxNameCalback(null);
        } else {
            getDropboxNameCalback(Error('ERROR: File does not exist.'));
        }
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
    

    /************************************************************************************
     *                                    START HERE                                  
     *************************************************************************************/
    beginProcess();
};