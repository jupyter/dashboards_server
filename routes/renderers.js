/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Renderers used in routes
 */
var appendExt = require('../app/append-ext');
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:renderer');
var fs = require('fs');
var nbfs = require('../app/notebook-fs');
var nbstore = require('../app/notebook-store');
var path = require('path');
var Promise = require('es6-promise').Promise;
var urljoin = require('url-join');

var DB_INDEX = config.get('DB_INDEX');
var DB_INDEX_DIR = config.get('DB_INDEX_DIR');
var DB_EXT = config.get('DB_FILE_EXT');
var NO_LAYOUT = 'no-layout';

function _renderList(req, res, next) {
    var listPath = req.params[0] || '';
    nbstore.list(listPath).then(
        function success(list) {
            // check each item to determine if a file or directory
            var statPromises = list.map(function(filename) {
                var url = urljoin(listPath, filename);
                return nbfs.stat(url).then(
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
            if (listPath) {
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
    var stats = (opts && opts.stats) || nbfs.stat(dbpath);

    return nbstore.get(dbpath, stats)
        .then(function success(notebook) {
            debug('Success loading nb');

            // get dashboard layout from notebook-level dashboard metadata
            var dashboardLayout = (notebook.metadata &&
                                  notebook.metadata.urth &&
                                  notebook.metadata.urth.dashboard &&
                                  notebook.metadata.urth.dashboard.layout) ||
                                  NO_LAYOUT;

            // backwards compatibility - old grid layouts don't have layout set
            if (dashboardLayout === NO_LAYOUT) {
                var isGrid = notebook.cells.some(function(cell) {
                    return cell.metadata &&
                           cell.metadata.urth &&
                           cell.metadata.urth.dashboard &&
                           cell.metadata.urth.dashboard.layout &&
                           ['row','col','width','height'].every(function(p) {
                               return cell.metadata.urth.dashboard.layout.hasOwnProperty(p);
                           });
                });
                if (isGrid) {
                    dashboardLayout = 'grid';
                }
            }

            res.status(200);
            res.render('dashboard', {
                title: title,
                notebook: notebook,
                username: req.session.username,
                hideChrome: hideChrome,
                supportsDeclWidgets: stats.supportsDeclWidgets,
                dashboardLayout: dashboardLayout,
                // need to set document.baseURI with trailing slash
                // (i.e. "/dashboards/nb/") so relative paths load correctly
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
    var dbpath = (opts && opts.dbpath) || req.params[0] || '';
    var hideChrome = !!(opts && opts.hideChrome);
    var errorOnList = !!(opts && opts.errorOnList);

    nbfs.stat(dbpath)
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
                var dbpathIndex = urljoin(dbpath, DB_INDEX_DIR, DB_INDEX);

                // If the path exists on disk and is a normal directory, check
                // if it contains an index bundle.
                nbfs.stat(dbpathIndex)
                    .then(function() {
                        // If it does contain an index bundle, redirect to it.
                        // We can't render it from because requests for static
                        // assets from the frontend will fail (off by one path).
                        res.redirect(urljoin(req.path, DB_INDEX_DIR));
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
                // If the path is neither a dashboard nor a directory, send it
                // as a regular file.
                res.sendFile(stats.fullpath);
            }
        })
        .catch(function failure(err) {
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
     * @param {Boolean} [opts.stats] - object returned from `notebook-fs.stat()`; if not provided, calls
     *                                 `notebook-fs.stat()`
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
     * @param {Boolean} [opts.stats] - object returned from `notebook-fs.stat()`; if not provided, calls
     *                                 `notebook-fs.stat()`
     */
    renderDashboard: _renderDashboard
};
