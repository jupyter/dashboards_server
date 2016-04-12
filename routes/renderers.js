/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Renderers used in routes
 */
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:renderer');
var fs = require('fs');
var nbstore = require('../app/notebook-store');
var path = require('path');
var Promise = require('es6-promise').Promise;
var urljoin = require('url-join');

var DB_INDEX = config.get('DB_INDEX')
var DB_INDEX_DIR = config.get('DB_INDEX_DIR')
var DB_EXT = config.get('DB_FILE_EXT');
var reNbExt = new RegExp('\\' + DB_EXT + '$');

function _renderList(req, res, next) {
    var listPath = req.params[0] || '';
    nbstore.list(listPath).then(
        function success(list) {
            // check each item to determine if a file or directory
            var statPromises = list.map(function(filename) {
                var url = urljoin(listPath, filename);
                return nbstore.stat(url).then(
                    function success(stats) {
                        var type;
                        if (stats.isDashboard) {
                            type = 'dashboard';
                        } else if (stats.isDirectory()) {
                            type = 'directory';
                        } else if (stats.isFile()) {
                            type = 'file';
                        }
                        var filepath = type === 'directory' ? url :
                                path.join(path.dirname(url), path.basename(url, DB_EXT));
                        return {
                            type: type,
                            path: filepath
                        };
                    }
                );
            });

            // render parent directory listing if not at root
            if (listPath.length > 0) {
                statPromises.unshift({
                    type: 'directory',
                    path: urljoin(listPath, '..')
                });
            }

            // render the list once all items have a type
            Promise.all(statPromises).then(
                function success(values) {
                    res.status(200);
                    res.render('list', {
                        username: req.session.username,
                        items: values,
                        title: 'Dashboards',
                        url: req.params[0]
                    });
                },
                function failure(err) {
                    next(err);
                }
            );
        },
        function failure(err) {
            next(err);
        }
    );
}

function _renderDashboard(req, res, next, opts) {
    var dbpath = (opts && opts.dbpath) || req.params[0];
    var title =  path.basename(dbpath, DB_EXT);
    var hideChrome = !!(opts && opts.hideChrome);
    var stats = (opts && opts.stats) || nbstore.stat(dbpath);

    return nbstore.get(dbpath, stats)
        .then(function success(notebook) {
            debug('Success loading nb');

            res.status(200);
            res.render('dashboard', {
                title: title,
                notebook: notebook,
                username: req.session.username,
                hideChrome: hideChrome,
                supportsDeclWidgets: stats.supportsDeclWidgets,
                // need to set document.baseURI with trailing slash (i.e. "/dashboards/nb/") so
                // that relative paths load correctly
                baseURI: urljoin(req.originalUrl, '/')
            });
        })
        .catch(function error(err) {
            // TODO better way of determing the error
            err.status = err.message.indexOf('loading') === -1 ? 500 : 404;
            next(err);
        });
}

function _render(req, res, next, opts) {
    var dbpath = (opts && opts.dbpath) || req.params[0] || '/';
    var hideChrome = !!(opts && opts.hideChrome);
    var errorOnList = !!(opts && opts.errorOnList);

    // First, check if this path refers to a notebook file of the same name
    // whether or not the oriinal request had an .ipynb on the end of it or not.
    // We do this so users can visit URLs without adding ipynb at the cost of 
    // masking folders with the same name as notebook files.
    var dbpathWithExt = dbpath + (reNbExt.test(dbpath) ? '' : DB_EXT);
    nbstore.stat(dbpathWithExt)
        .catch(function(err) {
            if (dbpath === dbpathWithExt) {
                throw err;
            }
            // If the path does not refer to a notebook, stat the path 
            // directly.
            return nbstore.stat(dbpath);
        })
        .then(function success(stats) {
            if (stats.isDashboard) {
                // If the path exists on disk and is a bundled dashboard 
                // directory, render the appropriate HTML.
                _renderDashboard(req, res, next, {
                    dbpath: dbpath,
                    hideChrome: hideChrome,
                    stats: stats
                }); 
            } else if (stats.isDirectory()) {
                // check if an index bundle exists in this path
                var dbpathIndex = path.join(dbpath, DB_INDEX_DIR, DB_INDEX);

                // If the path exists on disk and is a normal directory, check
                // if it contains an index bundle.
                nbstore.stat(dbpathIndex)
                    .then(function() {
                        // If it does contain an index bundle, redirect to it.
                        // We can't render it from because requests for static
                        // assets from the frontend will fail (off by one path).
                        res.redirect(path.join(req.path, DB_INDEX_DIR));
                    })
                    .catch(function() { 
                        // If the directory does not contain an index bundle,
                        // check if we can render a directory listing or not
                        // according to our settings.
                        if (errorOnList) {
                            var err = new Error('List not supported');
                            err.status = 404;
                            next(err);
                        } else {
                            _renderList(req, res, next);
                        }
                    });
            } else {
                // If the path is neither a dashboard or a directory, send it
                // as a regular file.
                res.sendFile(stats.fullpath);
            }
        })
        .catch(function failure(err) {
            // If path on disk does not exist at all, return 404 not found.
            if (err.code === 'ENOENT') {
                err.status = 404;
            }
            next(err);
        });
}

module.exports = {
    /**
     * Renders a dashboard or list of files or responds with an individual file
     * @param {Request}  req - HTTP request object
     * @param {Response} res - HTTP response object
     * @param {Function} next - next function
     * @param {Object} [opts] - additional options
     * @param {String} [opts.dbpath] - path to use instead of request param
     * @param {Boolean} [opts.hideChrome] - if true, disables UI chrome; defaults to false
     * @param {Boolean} [opts.stats] - object returned from `nbstore.stat()`; if not provided, calls
     *                                 `nbstore.stat()`
     */
    render: _render,
    /**
     * Renders the list of items at the directory specified in request param
     * @param {Request}  req - HTTP request object
     * @param {Response} res - HTTP response object
     * @param {Function} next - next function
     */
    renderList: _renderList,
    /**
     * Renders a dashboard at path specified by either request param or dbpath
     * @param {Request}  req - HTTP request object
     * @param {Response} res - HTTP response object
     * @param {Function} next - next function
     * @param {Object} [opts] - additional options
     * @param {String} [opts.dbpath] - path to use instead of request param
     * @param {Boolean} [opts.hideChrome] - if true, disables UI chrome; defaults to false
     * @param {Boolean} [opts.stats] - object returned from `nbstore.stat()`; if not provided, calls
     *                                 `nbstore.stat()`
     */
    renderDashboard: _renderDashboard
};
