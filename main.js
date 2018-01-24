/*eslint-env node, es6*/

/* Module Description */

/* Put dependencies here */

/* Include this line only if you are going to use Canvas API */
// const canvas = require('canvas-wrapper');

/* View available course object functions */
// https://github.com/byuitechops/d2l-to-canvas-conversion-tool/blob/master/documentation/classFunctions.md

module.exports = (course, stepCallback) => {

    /* Used to log successful actions (specific items) */
    course.log('Category', {'header': data});

    /* How to log a generic message. Use in place of console.log */
    course.message('message');

    /* How to report a warning */
    // course.warning('warning message...');

    /* How to report an error */
    // course.error(err);

    /* You should never call the stepCallback with an error. We want the
    whole program to run when testing so we can catch all existing errors */

    stepCallback(null, course);
};
