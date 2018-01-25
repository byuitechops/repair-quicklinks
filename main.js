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

    function retrieveFiles(course, functionCallback) {
        canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages`, (err, pages) => {
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

    function htmlChecker(course, pages, functionCallback) {
        asyncLib.eachSeries(pages, (page, eachSeriesCallback) => {
            canvas.get(`/api/v1/courses/${course.info.canvasOU}/pages/${page.url}`, (err, p) => {
                if (err) {
                    eachSeriesCallback(err);
                    return;
                } else {
                    console.log(JSON.stringify(p));
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
