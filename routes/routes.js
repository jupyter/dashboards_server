/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Normal routes that require login (if enabled)
 */
var config = require('../app/config');
var nbstore = require('../app/notebook-store');
var path = require('path');
var renderers = require('./renderers');
var router = require('express').Router();

var indexFilename = config.get('DB_INDEX');

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.exists('index').then(
        function success(indexFile) {
            if (indexFile) {
                renderers.renderDashboard(req, res, next, indexFile, false);
            } else {
                renderers.renderList(req, res, next);
            }
        },
        function failure(err) {
            next(err);
        }
    );
});

/* GET /dashboards - list of notebooks */
router.get('/dashboards', function(req, res, next) {
    renderers.renderList(req, res, next);
});

/* GET /dashboards-plain/* - same as /dashboards/* with no extra UI chrome */
router.get('/dashboards-plain/*', function(req, res, next) {
    renderDashboardOrList(req, res, next, null, true);
});

/* GET /dashboards/* - a single dashboard or list of files. */
router.get('/dashboards/*', function(req, res, next) {
    renderDashboardOrList(req, res, next, null, false);
});


function renderDashboardOrList(req, res, next, dbpath, hideChrome) {
    dbpath = dbpath || req.params[0];
    nbstore.stat(dbpath).then(
        function success(stats) {
            if (stats.isDashboard) {
                if (stats.hasIndex) {
                    dbpath = path.join(dbpath, indexFilename);
                } 
                renderers.renderDashboard(req, res, next, dbpath, hideChrome);
            } else if (stats.isDirectory()) {
                renderers.renderList(req, res, next);
            } else {
                // plain file -- return contents
                res.sendFile(stats.fullpath);
            }
        },
        function failure(err) {
            if (err.code === 'ENOENT') {
                err.status = 404;
            }
            next(err);
        }
    );
}


module.exports = router;
