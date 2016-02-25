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

var dbExt = config.get('DB_FILE_EXT');
var dataDir = config.get('NOTEBOOKS_DIR');

// cached notebook objects
var store = {};

/////////////////
// GET OPERATIONS
/////////////////

// Append the notebook file extension if left off
function _appendExt(nbpath) {
    var ext = path.extname(nbpath) === dbExt ? '' : dbExt;
    return nbpath + ext;
}

// determines if the specified file exists (case-insensitive)
function existsIgnoreCase(nbpath, cb) {
    var dirname = path.join(dataDir, path.dirname(nbpath));
    var basename = _appendExt(path.basename(nbpath)).toLowerCase();
    fs.readdir(dirname, function(err, items) {
        var file = null;
        for (var i = 0, len = items.length; i < len; i++) {
            if (items[i].toLowerCase() === basename) {
                file = items[i];
            }
        }
        cb(file);
    });
}

// stat the path in the data directory
function stat(nbpath, cb) {
    // file extension is optional, so first try with the specified nbpath
    fs.stat(path.join(dataDir, nbpath), function(err, status) {
        if (err && err.code === 'ENOENT') {
            // might have left off extension, so try appending the extension
            fs.stat(path.join(dataDir, _appendExt(nbpath)), cb);
        } else {
            cb.apply(null, arguments);
        }
    });
}

// Read notebook from cache or from file
function _loadNb(nbpath) {
    nbpath = _appendExt(nbpath);
    return new Promise(function(resolve, reject) {
        var nbPath = path.join(dataDir, nbpath);
        fs.readFile(nbPath, 'utf8', function(err, rawData) {
            if (err) {
                reject(new Error('Error loading notebook'));
            } else {
                try {
                    var nb = JSON.parse(rawData);
                    store[nbpath] = nb;
                    resolve(nb);
                } catch(e) {
                    reject(new Error('Error parsing notebook JSON'));
                }
            }
        });
    });
}

function list(dir) {
    // list all (not hidden) children of the specified directory
    // (within the data directory)
    var dbpath = path.join(dataDir, dir || '');
    return new Promise(function(resolve, reject) {
        fs.readdir(dbpath, function(err, files) {
            if (err) {
                reject(new Error('Error reading path: ' + dbpath));
            } else {
                files = files.filter(function(f) {
                        return /^[^.]/.test(f); // not hidden
                    });
                resolve(files);
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

var _uploadMessage = 'Make sure to upload a single Jupyter Notebook file (*.ipynb).';

function _getDestination (req) {
    // parse destination directory from request url
    var nbdir = path.dirname(req.params[0]);
    var destDir = path.join(dataDir, nbdir);
    return destDir;
}

function _fileFilter (filename) {
    // check for file extension
    return new RegExp('\\'+dbExt+'$').test(filename); // escape the leading dot
}

// busboy limits.
// Busboy will ignore any files past the limit (and not throw an error), so to
// send a descriptive error message when too many files are sent, lets set the
// file limit to 2 and return an error if 2 files are sent.
var _uploadLimits = {
    fields: 0,
    files: 2,
    parts: 2
};

function upload(req, res, next) {
    var buffers = [];
    var bufferLength = 0;
    var destination = _getDestination(req);
    var filename = _appendExt(path.basename(req.params[0]));
    var cachedPath = req.params[0];
    var fileCount = 0;

    // only allow 1 file and nothing else in the form
    var busboy = new Busboy({
        headers: req.headers,
        limits: _uploadLimits
    });

    // handle file upload
    var uploadPromise = null;
    busboy.on('file', function(fieldname, file, originalname, encoding, mimetype) {
        if (++fileCount > 1) {
            // too many files, error
            uploadPromise = Promise.reject(new Error('Too many files. ' + _uploadMessage));
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
                    reject(new Error('Wrong file extension. ' + _uploadMessage));
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
            next(new Error('No file provided. ' + _uploadMessage));
        }
    });

    // start the form processing
    req.pipe(busboy);
}

module.exports = {
    /**
     * Checks if the specified file exists (case-insensitive)
     * @param  {String} nbpath - path to a notebook
     * @param  {Function} cb - callback called with the name of the file if it exists, else null.
     */
    exists: existsIgnoreCase,
    /**
     * Loads, parses, and returns cells (minus code) of the notebook specified by nbpath.
     * @param  {String} nbpath - path of the notbeook to load
     * @return {Promise} ES6 Promise resolved with notebook JSON or error string
     */
    get: get,
    /**
     * Lists contents of the specified directory
     * @param {String} dir - optional sub-directory to Lists
     * @return {Promise} ES6 Promise resolved with list of contents
     */
    list: list,
    /**
     * Deletes the specified notebook
     * @param {String} nbpath - path to notebook to delete
     */
    remove: remove,
    /**
     * Runs `stat` on the specified path
     * @param {String} nbpath - path that may be a notebook or directory
     * @param {Function} cb - callback called with the `stat` results
     */
    stat: stat,
    /**
     * Uploads a notebook file
     * @param {Request}  req - HTTP request object
     * @param {Response} res - HTTP response object
     * @param {Function} next - next function
     */
    upload: upload
};
