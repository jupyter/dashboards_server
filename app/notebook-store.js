/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var Busboy = require('busboy');
var config = require('./config');
var debug = require('debug')('dashboard-proxy:notebook-store');
var fs = require('fs');
var path = require('path');
var Promise = require('es6-promise').Promise;

var IPYNB_EXTENSION = '.ipynb';

// cached notebook objects
var store = {};

/////////////////
// GET OPERATIONS
/////////////////

// Read notebook from cache or from file
function _loadNb(nbpath) {
    return new Promise(function(resolve, reject) {
        var ipynb = /\.ipynb$/.test(nbpath) ? '' : '.ipynb';
        var nbdir = config.get('NOTEBOOKS_DIR');
        var nbPath = path.join(__dirname, nbdir, nbpath + ipynb);
        console.info('Attempting to load notebook file:', nbPath);
        fs.readFile(nbPath, 'utf8', function(err, rawData) {
            if (err) {
                reject(new Error('Error loading notebook file'));
            } else {
                try {
                    var nb = JSON.parse(rawData);
                    store[nbpath] = nb;
                    resolve(nb);
                    debug('Resolving nb load:', nbpath);
                } catch(e) {
                    reject(new Error('Error parsing notebook file'));
                }
            }
        });
    });
}

function get(nbpath) {
    return new Promise(function(resolve, reject) {
        if (store.hasOwnProperty(nbpath)) {
            resolve(store[nbpath]);
        } else {
            resolve(_loadNb(nbpath));
        }
    });
}

////////////////////
// DELETE OPERATIONS
////////////////////

function remove(nbpath) {
    delete store[nbpath];
}

////////////////////
// UPLOAD OPERATIONS
////////////////////

function _getDestination (req) {
    // parse destination directory from request url
    var notebooksDir = config.get('NOTEBOOKS_DIR');
    var nbdir = path.dirname(req.params[0]);
    var destDir = path.join(__dirname, notebooksDir, nbdir);
    return destDir;
}

function _getFilename (req) {
    // get file name from request url, not from uploaded file name
    var name = path.basename(req.params[0]);
    name += path.extname(name) === IPYNB_EXTENSION ? '' : IPYNB_EXTENSION;
    return name;
}

function _fileFilter (filename) {
    // check for *.ipynb extension
    return /\.ipynb$/.test(filename);
}

var _uploadLimits = {
    fields: 0,
    files: 2, // really a limit of 1, but set to 2 to allow easy error response
    parts: 2
};

function upload(req, res, next) {
    var buffers = [];
    var bufferLength = 0;
    var destination = _getDestination(req);
    var filename = _getFilename(req);
    var cachedPath = req.params[0];
    var fileCount = 0;

    // only allow 1 file and nothing else in the form
    var busboy = new Busboy({
        headers: req.headers,
        limits: _uploadLimits
    });

    // handle file upload
    var uploadMessage = 'Make sure to upload a single Jupyter Notebook file (*.ipynb).';
    var uploadPromise = null;
    busboy.on('file', function(fieldname, file, originalname, encoding, mimetype) {
        if (++fileCount > 1) {
            // too many files, error
            uploadPromise = Promise.reject(new Error('Too many files. ' + uploadMessage));
            file.resume();
        } else {
            uploadPromise = new Promise(function(resolve, reject) {
                if (_fileFilter(originalname)) {
                    debug('Reading file: ' + originalname);
                    file.on('data', function(data) {
                        debug('File [' + originalname + ']: received ' + data.length + ' bytes');
                        buffers.push(data);
                        bufferLength += data.length;
                    });
                    file.on('end', function() {
                        debug('File [' + fieldname + '] Finished');
                        var totalFile = Buffer.concat(buffers, bufferLength);

                        fs.mkdir(destination, function(err) {
                            if (err && err.code !== 'EEXIST') {
                                reject(err);
                            } else {
                                var destFilename = path.join(destination, filename);
                                debug('Uploading notebook: ' + destFilename);
                                fs.writeFile(destFilename, totalFile, function(err) {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve();
                                    }
                                });
                            }
                        });
                    });
                } else {
                    file.resume();
                    reject(new Error('Wrong file extension. ' + uploadMessage));
                }
            });
        }
    });

    // finish processing form
    busboy.on('finish', function() {
        debug('Finished reading form data');

        if (uploadPromise) {
            // a file was uploaded
            uploadPromise.then(
                function success() {
                    // bust the notebook cache so it can load the new file
                    remove(cachedPath);
                    next();
                },
                function failure(err) {
                    next(err);
                }
            );
        } else {
            // a file was not uploaded
            next(new Error('No file provided. ' + uploadMessage));
        }
    });

    // start the form processing
    req.pipe(busboy);
}

module.exports = {
    /**
     * Loads, parses, and returns cells (minus code) of the notebook specified by nbpath.
     * @param  {String} nbpath - path of the notbeook to load
     * @return {Promise} ES6 Promise resolved with notebook JSON or error string
     */
    get: get,
    remove: remove,
    upload: upload
};
