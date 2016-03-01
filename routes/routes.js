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

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.exists('index').then(
        function success(indexFile) {
            if (indexFile) {
                renderers.renderDashboard(req, res, next, {
                    dbpath: indexFile
                });
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
    renderers.render(req, res, next, {
        hideChrome: true
    });
});

/* GET /dashboards/* - a single dashboard or list of files. */
router.get('/dashboards/*', function(req, res, next) {
    renderers.render(req, res, next);
});

module.exports = router;
