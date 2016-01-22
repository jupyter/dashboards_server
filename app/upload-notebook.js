/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
 /**
 * Module defining Multer.DiskStorage functions for uploading a notebook file
 */

var config = require('./config');
var fs = require('fs');
var path = require('path');
var debug = require('debug')('dashboard-proxy:server');

var IPYNB_EXTENSION = '.ipynb';

module.exports = {
    destination: function (req, file, cb) {
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
    },
    filename: function (req, file, cb) {
        // get file name from request url, not from uploaded file name
        var name = path.basename(req.params[0]);
        name += path.extname(name) === IPYNB_EXTENSION ? '' : IPYNB_EXTENSION;
        debug('Uploading notebook named: ' + name);
        cb(null, name);
    }
};
