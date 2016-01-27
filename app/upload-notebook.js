/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
 /**
 * Module defining Multer.DiskStorage functions for uploading a notebook file
 */

var config = require('./config');
var debug = require('debug')('dashboard-proxy:server');
var fs = require('fs');
var path = require('path');
var multer = require('multer');

var IPYNB_EXTENSION = '.ipynb';

function destination (req, file, cb) {
    // parse destination directory from request url
    var notebooksDir = config.get('NOTEBOOKS_DIR');
    var nbdir = path.dirname(req.params[0]);
    var destDir = path.join(__dirname, notebooksDir, nbdir);

    try {
        fs.mkdirSync(destDir);
    } catch (e) {
        debug('Error creating directory for notebook upload: ' + e.message);
    }

    debug('Uploading notebook to: ' + destDir);
    cb(null, destDir);
}

function filename (req, file, cb) {
    // get file name from request url, not from uploaded file name
    var name = path.basename(req.params[0]);
    name += path.extname(name) === IPYNB_EXTENSION ? '' : IPYNB_EXTENSION;
    debug('Uploading notebook named: ' + name);
    cb(null, name);
}

function fileFilter (req, file, cb) {
    // check for *.ipynb extension
    if (/\.ipynb$/.test(file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('Wrong file extension. Make sure to upload a Jupyter Notebook file (*.ipynb).'));
    }
}

var limits = {
    fields: 0,
    files: 1,
    parts: 1
};

// Use multer disk storage to write uploaded file
var storage = multer.diskStorage({
    destination: destination,
    filename: filename
});
module.exports = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: limits
});
