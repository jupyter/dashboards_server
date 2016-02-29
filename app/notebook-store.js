/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var Busboy = require('busboy');
var config = require('./config');
var debug = require('debug')('dashboard-proxy:notebook-store');
var extract = require('extract-zip');
var fs = require('fs-extra');
var path = require('path');
var Promise = require('es6-promise').Promise;
var tmp = require('tmp');

var DB_EXT = config.get('DB_FILE_EXT');
var DATA_DIR = config.get('NOTEBOOKS_DIR');
var INDEX_NB_NAME = config.get('DB_INDEX');
var ZIP_EXT = '.zip';

var allowedUploadExts = [ DB_EXT, ZIP_EXT ];
var hasIndex = new RegExp(INDEX_NB_NAME + '$');
var nbExtension = new RegExp('\\' + DB_EXT + '$');

// cached notebook objects
var store = {};

/////////////////
// GET OPERATIONS
/////////////////

// Append the notebook file extension if left off
function _appendExt(nbpath) {
    var ext = path.extname(nbpath) === DB_EXT ? '' : DB_EXT;
    return nbpath + ext;
}

// determines if the specified file exists (case-insensitive)
function existsIgnoreCase(nbpath) {
    return new Promise(function(resolve, reject) {
        if (!path.isAbsolute(nbpath)) {
            nbpath = path.join(DATA_DIR, nbpath);
        }
        var dirname = path.dirname(nbpath);
        var basename = _appendExt(path.basename(nbpath)).toLowerCase();
        fs.readdir(dirname, function(err, items) {
            if (err) {
                return reject(err);
            }

            var file = null;
            for (var i = 0, len = items.length; i < len; i++) {
                if (items[i].toLowerCase() === basename) {
                    file = items[i];
                }
            }
            resolve(file);
        });
    });
}

// stat the path in the data directory
function stat(nbpath) {
    nbpath = path.join(DATA_DIR, nbpath);
    return new Promise(function(resolve, reject) {
        // file extension is optional, so first try with the specified nbpath
        fs.stat(nbpath, function(err, stats) {
            if (err && err.code === 'ENOENT' && !nbExtension.test(nbpath)) {
                // might have left off extension, so try appending it
                fs.stat(_appendExt(nbpath), function(err, stats) {
                    if (err) {
                        reject(err);
                    } else {
                        stats.isDashboard = stats.isFile();
                        resolve(stats);
                    }
                });
            } else if (err) {
                reject(err);
            } else {
                stats.fullpath = nbpath;

                if (stats.isDirectory()) {
                    // check if this directory contains an index dashboard
                    existsIgnoreCase(path.join(nbpath, INDEX_NB_NAME)).then(
                        function success(fn) {
                            stats.isDashboard = stats.hasIndex = !!fn;
                            if (stats.hasIndex) {
                                // check if bundled dashboard has an 'urth_components' dir
                                fs.stat(path.join(nbpath, 'urth_components'),
                                    function(err, urth_stats) {
                                        stats.supportsDeclWidgets = !err && urth_stats.isDirectory();
                                        resolve(stats);
                                    });
                            } else {
                                resolve(stats);
                            }
                        },
                        function failure(err) {
                            reject(err);
                        }
                    );
                } else {
                    stats.isDashboard =
                            stats.isFile() && path.extname(nbpath) === DB_EXT;
                    resolve(stats);
                }
            }
        });
    });
}

// Read notebook from cache or from file
function _loadNb(nbpath) {
    nbpath = _appendExt(nbpath);
    return new Promise(function(resolve, reject) {
        var nbPath = path.join(DATA_DIR, nbpath);
        fs.readFile(nbPath, 'utf8', function(err, rawData) {
            if (err) {
                reject(new Error('Error loading notebook'));
            } else {
                try {
                    var nb = JSON.parse(rawData);

                    // cache notebook for future reads
                    store[nbpath] = nb;
                    if (hasIndex.test(nbpath)) {
                        // cache bundled dashboard directory as well
                        store[path.dirname(nbpath)] = nb;
                    }

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
    var dbpath = path.join(DATA_DIR, dir || '');
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

/**
 * Return absolute destination directory
 * @param  {Request} req
 * @return {String}
 */
function _getDestination (req) {
    // parse destination directory from request url
    var nbdir = path.dirname(req.params[0]);
    var destDir = path.join(DATA_DIR, nbdir);
    return destDir;
}

function _fileFilter (filename) {
    // check that file extension is in list of allowed upload file extensions
    var ext = path.extname(filename).toLowerCase();
    return allowedUploadExts.indexOf(ext) !== -1;
}

/**
 * Write file contents to specified location
 * 
 * @param  {String} destination - directory path which will contain uploaded dashboard
 * @param  {String} filename    - name of dashboard
 * @param  {Buffer} buffer      - contents of uploaded file
 * @return {Promise}
 */
function _writeFile (destination, filename, buffer) {
    return new Promise(function(resolve, reject) {
        fs.mkdir(destination, function(err) {
            if (err && err.code !== 'EEXIST') {
                reject(err);
            } else {
                var destFilename = path.join(destination, filename);
                debug('Uploading notebook: ' + destFilename);
                fs.writeFile(destFilename, buffer, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }
        });
    });
}

/**
 * Write zip archive contents to specified location
 * 
 * @param  {String} destination - directory path which will contain uploaded dashboard
 * @param  {String} filename    - name of dashboard
 * @param  {Buffer} buffer      - contents of uploaded zip archive
 * @return {Promise}
 */
function _writeZipFile(destination, filename, buffer) {
    // create a temporary directory in which to unzip archive
    return new Promise(function(resolve, reject) {
        tmp.dir({ unsafeCleanup: true }, function(err, tmpDir, cleanup) {
            if (err) {
                return reject(err);
            }
            resolve({
                path: tmpDir,
                cleanup: cleanup
            });
        });
    })
    .then(function(tempobj) {
        var tmpDir = tempobj.path;
        var tmpZip = path.join(tmpDir, filename + ZIP_EXT);
        var tmpUnzipDir = path.join(path.dirname(tmpZip), path.basename(tmpZip, ZIP_EXT));

        // write zip archive contents to filesystem
        return _writeFile(tmpDir, path.basename(tmpZip), buffer)
        // extract zip archive
        .then(function() {
            return new Promise(function(resolve, reject) {
                extract(tmpZip, {dir: tmpUnzipDir}, function (err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve(tmpUnzipDir);
                });
            });
        })
        // validate zip archive contents -- does it contain 'index.ipynb'?
        .then(function(tmpUnzipDir) {
            return new Promise(function(resolve, reject) {
                fs.stat(path.join(tmpUnzipDir, INDEX_NB_NAME), function(err, stat) {
                    if (!err && stat.isFile()) {
                        return resolve(tmpUnzipDir);
                    }
                    reject(err);
                });
            });
        })
        // move unzipped contents to data directory, overwriting previously existing dir
        .then(function(tmpUnzipDir) {
            var destDir = path.join(destination, filename);

            return new Promise(function(resolve, reject) {
                fs.move(tmpUnzipDir, destDir, { clobber: true }, function(err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            });
        })
        // cleanup on success or failure
        .then(tempobj.cleanup, function failure(err) {
            tempobj.cleanup();
            throw err;
        });
    });
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
    var filename = path.basename(req.params[0]);
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
                        var promise;

                        // write the file correctly
                        var extension = path.extname(originalname);
                        if (extension === DB_EXT) {
                            promise = _writeFile(destination, _appendExt(filename), totalFile);
                        } else if (extension === '.zip') {
                            promise = _writeZipFile(destination, filename, totalFile);
                        }

                        promise.then(resolve, function failure(err) {
                            reject(new Error('Failed to upload file:', err.message));
                        });
                    });
                    file.on('error', function(err) {
                        reject(err);
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
     * @return {Promise} promise resolved with the name of the file if it exists, else null
     */
    exists: existsIgnoreCase,
    /**
     * Loads, parses, and returns cells (minus code) of the notebook specified by nbpath
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
     * @return {Promise} promise resolved with the `stat` results
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
