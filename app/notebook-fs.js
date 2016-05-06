/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Augmented fs functions for notebook files.
 */
var appendExt = require('./append-ext');
var config = require('./config');
var fs = require('fs');
var path = require('path');

var DATA_DIR = config.get('NOTEBOOKS_DIR');
var DB_EXT = config.get('DB_FILE_EXT');
var INDEX_NB_NAME = config.get('DB_INDEX');

function _ensureDataPath(nbpath) {
    return nbpath.indexOf(DATA_DIR) === 0 ? nbpath : path.join(DATA_DIR, nbpath);
}

function _exists(nbpath) {
    return new Promise(function(resolve, reject) {
        nbpath = _ensureDataPath(nbpath);
        fs.stat(nbpath, function(err, stats) {
            if (err) {
                if (err.code === 'ENOENT') { // file not found
                    resolve(false);
                } else {
                    reject(err);
                }
            } else {
                resolve(stats.isFile());
            }
        });
    });
}

function _statError(err, nbpath) {
    var e = new Error('Error getting notebook info: ' + nbpath + ' - ' + err.message);
    if (err.code === 'ENOENT') {
        e.status = 404;
    }
    return e;
}

function _statNbOrDir(nbpath) {
    return new Promise(function(resolve, reject) {
        // try to stat a notebook first, then fallback to original value
        var extPath = appendExt(nbpath, DB_EXT);
        fs.stat(extPath, function(err, stats) {
            if (err && extPath === nbpath) {
                reject(_statError(err, nbpath));
            } else if (stats && stats.isFile()) {
                stats.fullpath = extPath;
                resolve(stats); // notebook exists
            } else {
                // path may be a directory (bundled dashboard) or other file
                fs.stat(nbpath, function(err, stats) {
                    if (err) {
                        reject(_statError(err, nbpath));
                    } else {
                        stats.fullpath = nbpath;
                        resolve(stats);
                    }
                });
            }
        });
    });
}

function _stat(nbpath) {
    nbpath = _ensureDataPath(nbpath);
    var ext = path.extname(nbpath);

    return _statNbOrDir(nbpath).then(function(stats) {
        if (stats.isDirectory()) {
            // check if this directory contains an index dashboard
            var indexPath = path.join(nbpath, INDEX_NB_NAME);
            return _exists(indexPath).then(function (exists) {
                stats.isDashboard = stats.hasIndex = exists;
                if (stats.hasIndex) {
                    stats.fullpath = indexPath;
                    return new Promise(function(resolve) {
                        // check if bundled dashboard has an 'urth_components' dir
                        fs.stat(path.join(nbpath, 'urth_components'),
                            function(err, urth_stats) {
                                stats.supportsDeclWidgets = !err && urth_stats.isDirectory();
                                resolve(stats);
                            }
                        );
                    });
                } else {
                    return stats;
                }
            });
        } else {
            // might be a dashboard file or a "regular" file
            stats.isDashboard = stats.isFile() && path.extname(stats.fullpath) === DB_EXT;
            return stats;
        }
    });
}

module.exports = {
    /**
     * Checks if the specified file exists
     * @param  {String} nbpath - path to a notebook
     * @return {Promise(Boolean)} resolved to true if it exists
     */
    exists: _exists,
    /**
     * Runs `stat` on the specified path.
     * @param {String} nbpath - Path to a notebook or directory.
     *     If not relative to data directory, it will be made so.
     * @return {Promise} resolved with the `stat` results. Will contain some custom properties:
     *     {String} fullpath - absolute path of file (index path if bundled)
     *     {Boolean} isDashboard - true if the path is a dashboard file or directory
     *     {Boolean} hasIndex - true if the path contains an index dashboard
     *     {Boolean} supportsDeclWidgets - true if the dashboard supports Declarative Widgets
     */
    stat: _stat
};
