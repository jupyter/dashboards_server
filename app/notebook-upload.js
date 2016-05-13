/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var appendExt = require('./append-ext');
var Busboy = require('busboy');
var config = require('./config');
var debug = require('debug')('dashboard-proxy:upload-notebook');
var error = require('debug')('dashboard-proxy:upload-notebook:error');
var extract = require('extract-zip');
var fs = require('fs-extra');
var nbstore = require('./notebook-store');
var path = require('path');
var Promise = require('es6-promise').Promise;
var rimraf = require('rimraf');
var tmp = require('tmp');

var DATA_DIR = config.get('NOTEBOOKS_DIR');
var DB_EXT = config.get('DB_FILE_EXT');
var INDEX_NB_NAME = config.get('DB_INDEX');
var ZIP_EXT = '.zip';
var ALLOWED_UPLOAD_EXTS = [ DB_EXT, ZIP_EXT];

// busboy limits.
// Busboy will ignore any files past the limit (and not throw an error), so to
// send a descriptive error message when too many files are sent, lets set the
// file limit to 2 and return an error if 2 files are sent.
var _uploadLimits = {
    fields: 0,
    files: 2,
    parts: 2
};

var _uploadMessage = 'Make sure to upload a single Jupyter Notebook file (*.ipynb).';

function _fileFilter (filename) {
    // check that file extension is in list of allowed upload file extensions
    var ext = path.extname(filename).toLowerCase();
    return ALLOWED_UPLOAD_EXTS.indexOf(ext) !== -1;
}

/**
 * Write file contents to specified location
 *
 * @param  {String} destination - file path of uploaded dashboard
 * @param  {Buffer} buffer      - contents of uploaded file
 * @return {Promise}
 */
function _writeFile (destination, buffer) {
    return new Promise(function(resolve, reject) {
        fs.mkdir(path.dirname(destination), function(err) {
            if (err && err.code !== 'EEXIST') {
                reject(err);
            } else {
                debug('Uploading notebook: ' + destination);
                fs.writeFile(destination, buffer, function(err) {
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
 * @param  {String} destination - directory of uploaded dashboard
 * @param  {Buffer} buffer      - contents of uploaded zip archive
 * @return {Promise}
 */
function _writeZipFile(destination, buffer) {
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
        var tmpZip = path.join(tmpDir, appendExt(path.basename(destination), ZIP_EXT));
        var tmpUnzipDir = path.join(path.dirname(tmpZip), path.basename(tmpZip, ZIP_EXT));

        // write zip archive contents to filesystem
        return _writeFile(tmpZip, buffer)
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
            return new Promise(function(resolve, reject) {
                fs.move(tmpUnzipDir, destination, { clobber: true }, function(err) {
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

/**
 * Cleanup previously existing dashboard. If uploading a notebook, remove any similarly named
 * directory (bundled dashboard). If uploading a bundled dashboard, remove similarly named
 * notebook file.
 *
 * @param  {String} destination     - directory of uploaded dashboard
 * @param  {Boolean} destIsNotebook - whether uploaded dashboard is a notebook file (true) or a
 *                                    bundled dashboard (false)
 * @return {Promise}
 */
function _cleanPreviousDashboard(destination, destIsNotebook) {
    return new Promise(function(resolve, reject) {
        if (destIsNotebook) {
            // destination is a notebook; ensure there isn't a directory by same name
            rimraf(destination, { disableGlob: true }, function(err) {
                if (err) {
                    reject('Failed to remove existing bundled dashboard directory: ' + err.message);
                    return;
                }
                resolve();
            });
        } else {
            // destination is a bundled dashboard; ensure there isn't a notebook with same name
            fs.unlink(appendExt(destination, DB_EXT), function(err) {
                if (err && err.code !== 'ENOENT') { // ignore "file doesn't exist" errors
                    reject('Failed to remove existing notebook: ' + err.message);
                    return;
                }
                resolve();
            });
        }
    });
}

/**
 * Middleware function to upload a notebook file
 * @param {Request}  req - HTTP request object
 * @param {Response} res - HTTP response object
 * @param {Function} next - next function
 */
module.exports = function (req, res, next) {
    var buffers = [];
    var bufferLength = 0;
    var destination = path.join(DATA_DIR, req.params[0]);
    var cachedPath = req.params[0];
    var fileCount = 0;

    // only allow 1 file and nothing else in the form
    var busboy = new Busboy({
        headers: req.headers,
        limits: _uploadLimits
    });

    var uploadPromise = null;

    // handle file upload
    busboy.on('file', function(fieldname, file, originalname, encoding, mimetype) {
        if (++fileCount > 1) {
            // too many files, error
            uploadPromise = Promise.reject('Too many files. ' + _uploadMessage);
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

                        // write the file correctly
                        var extension = path.extname(originalname);
                        var destIsNotebook = extension === DB_EXT;
                        var promise = Promise.reject('File not written');
                        if (destIsNotebook) {
                            promise = _writeFile(appendExt(destination, DB_EXT), totalFile);
                        } else if (extension === '.zip') {
                            promise = _writeZipFile(destination, totalFile);
                        }

                        promise.catch(function(err) {
                            reject('Failed to upload file: ' + err.message);
                        })
                        .then(function() {
                            _cleanPreviousDashboard(destination, destIsNotebook);
                        })
                        // upload has successfully finished, but failed to cleanup other
                        // dashboard; just log an error
                        .catch(error)
                        .then(resolve);
                    });
                    file.on('error', function(err) {
                        reject(err);
                    });
                } else {
                    file.resume();
                    reject('Wrong file extension. ' + _uploadMessage);
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
                    // clear the notebook cache so it can load the new file
                    nbstore.uncache(cachedPath);
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
};
