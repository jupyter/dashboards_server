/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Normal routes that require login (if enabled)
 */
var authToken = require('../app/auth-token');
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:router');
var fs = require('fs');
var nbstore = require('../app/notebook-store');
var path = require('path');
var Promise = require('es6-promise').Promise;
var router = require('express').Router();
var urljoin = require('url-join');

var indexRegex = /^index\.ipynb$/i;
var dbExt = config.get('DB_FILE_EXT');

function _renderList(req, res, list, next) {
    // check all items to determine if a file or directory
    var statPromises = list.map(function(item) {
        return new Promise(function(resolve, reject) {
            nbstore.stat(item, function(err, stats) {
                if (err) {
                    reject(err);
                } else {
                    var type;
                    if (stats.isDirectory()) {
                        type = 'directory';
                    } else if (stats.isFile()) {
                        if (path.extname(item) === dbExt) {
                            type = 'dashboard';
                        } else {
                            type = 'file';
                        }
                    }
                    resolve({ type: type, url: item });
                }
            });
        });
    });

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
}

function _renderDashboard(req, res, next, hideChrome) {
    var dbpath = req.params[0];
    nbstore.stat(dbpath, function(err, stats) {
        if (err) {
            if (err.code === 'ENOENT') {
                err.status = 404;
            }
            next(err);
        } else if (stats.isDirectory()) {
            nbstore.list(dbpath).then(
                function success(list) {
                    var pathList = list.map(function(f) {
                        return urljoin(dbpath, f);
                    });
                    pathList.unshift(urljoin(dbpath, '..'));
                    _renderList(req, res, pathList, next);
                },
                function error(err) {
                    next(err);
                }
            );
        } else {
            nbstore.get(dbpath).then(
                function success(notebook) {
                    debug('Success loading nb');

                    var nbname = path.basename(dbpath, dbExt);
                    var isIndex = indexRegex.test(dbpath);

                    res.status(200);
                    res.render('dashboard', {
                        title: nbname,
                        notebook: notebook,
                        username: req.session.username,
                        showAllLink: isIndex,
                        hideChrome: hideChrome
                    });
                },
                function error(err) {
                    // TODO better way of determing the error
                    err.status = err.message.indexOf('loading') === -1 ? 500 : 404;
                    next(err);
                }
            );
        }
    });
}

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            // if index notebook exists redirect to it immediately
            var indexFound;
            for (var i=0; i<notebooks.length; i++) {
                if (indexRegex.test(notebooks[i])) {
                    indexFound = notebooks[i];
                    break;
                }
            }
            if (indexFound) {
                // redirect to the index notebook
                res.redirect('/dashboards/' + indexFound);
            } else {
                _renderList(req, res, notebooks, next);
            }
        },
        function error(err) {
            next(err);
        }
    );
});

/* GET /dashboards - list of notebooks */
router.get('/dashboards', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            _renderList(req, res, notebooks, next);
        },
        function error(err) {
            next(err);
        }
    );
});

/* GET /dashboards-plain/* - same as /dashboards/* with no extra UI chrome */
router.get('/dashboards-plain/*', function(req, res, next) {
    _renderDashboard(req, res, next, true);
});

/* GET /dashboards/* - a single dashboard or list of files. */
router.get('/dashboards/*', function(req, res, next) {
    _renderDashboard(req, res, next);
});

module.exports = router;
