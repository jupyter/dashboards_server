/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Normal routes that require login (if enabled)
 */
var nbstore = require('../app/notebook-store');
var renderers = require('./renderers');
var router = require('express').Router();

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.exists('index', function(indexFile) {
        if (indexFile) {
            renderers.renderDashboard(req, res, next, indexFile, false);
        } else {
            renderers.renderList(req, res, next);
        }
    });
});

/* GET /dashboards - list of notebooks */
router.get('/dashboards', function(req, res, next) {
    renderers.renderList(req, res, next);
});

/* GET /dashboards-plain/* - same as /dashboards/* with no extra UI chrome */
router.get('/dashboards-plain/*', function(req, res, next) {
    renderers.render(req, res, next, null, true);
});

/* GET /dashboards/* - a single dashboard or list of files. */
router.get('/dashboards/*', function(req, res, next) {
    renderers.render(req, res, next, null, false);
});

module.exports = router;
