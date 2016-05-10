/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var appendExt = require('./append-ext');
var Busboy = require('busboy');
var config = require('./config');
var debug = require('debug')('dashboard-proxy:upload-notebook');
var extract = require('extract-zip');
var fs = require('fs-extra');
var nbstore = require('./notebook-store');
var path = require('path');
var Promise = require('es6-promise').Promise;
var tmp = require('tmp');

var DATA_DIR = config.get('NOTEBOOKS_DIR');
var DB_EXT = config.get('DB_FILE_EXT');
var ENCODING = 'utf8';
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

                        // write the file correctly
                        var extension = path.extname(originalname);
                        var promise = Promise.reject('File not written');
                        if (extension === DB_EXT) {
                            promise = _writeFile(appendExt(destination, DB_EXT), totalFile);
                        } else if (extension === '.zip') {
                            promise = _writeZipFile(destination, totalFile);
                        }
                        promise.then(resolve, function failure(err) {
                            reject(new Error('Failed to upload file: ' + err.message));
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
