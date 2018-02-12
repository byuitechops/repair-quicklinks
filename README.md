# Repair Quicklinks
### *Package Name*: repair-quicklinks
### *Child Type*: Post-Import
### *Platform*: Post-Import
### *Required*: Required

This child module is built to be used by the Brigham Young University - Idaho D2L to Canvas Conversion Tool. It utilizes the standard `module.exports => (course, stepCallback)` signature and uses the Conversion Tool's standard logging functions. You can view extended documentation [Here](https://github.com/byuitechops/d2l-to-canvas-conversion-tool/tree/master/documentation).

## Purpose

During course import from Brightspace D2L to Canvas, the quicklinks for only assignments (dropboxes) become broken. This child module goes through all of the quicklinks
in the course and ensures that each dropbox link is found and fixed.

## How to Install

```
npm install repair-quicklinks
```

## Run Requirements

None

## Options

None

## Outputs

None

## Process

Describe in steps how the module accomplishes its goals.

1. Find dropbox_d2l.xml in the course files and export all of the contents (namely, name and id - since that is all we need for this child module) to an array.
2. Go through the course and analyze every page.
3. Utilize cheerio.js to grab every link on the page - it stores the results in an array
4. If the link is a dropbox, the child module pushes the page into an array. 
5. Once it finishes analyzing the page, it calls the fixDropbox function which then goes through the page again and extracts all of the dropbox links
6. Extract the ID from the link (since the Brightspace D2L link ID is not different) and compare it with the previously created array that came from dropbox_d2l.xml
to get the name of the dropbox.
7. Make an API call to Canvas to retrieve the assignment and the URL of the dropbox in the course.
8. If there are more than one dropbox link, steps 6 and 7 are repeated and the results are stored in an array
9. After the page is parsed and all of the correct links are retrieved, it will call a function to replace all of the bad links with the new links.
10. Once all of the links has been replaced, the child module makes an API call to Canvas to update the HTML that now has the correct links.

## Log Categories

List the categories used in logging data in your module.

- bad link, new link, page url - Title: replace-dropbox-quicklinks

## Requirements

1. Each dropbox quicklink in any course instructions and/or activities leads to the correct dropbox in the course. 
