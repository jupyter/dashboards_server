/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Normal routes that require login (if enabled)
 */
var config = require('../app/config');
var renderers = require('./renderers');
var router = require('express').Router();

/* GET /dashboards/* - a single dashboard or list of files (subdirectories) */
router.get('/dashboards(/*)?', function(req, res, next) {
    renderers.render(req, res, next);
});

/* GET /dashboards-plain/* - same as /dashboards/* with no extra UI chrome */
router.get('/dashboards-plain(/*)?', function(req, res, next) {
    renderers.render(req, res, next, {
        hideChrome: true
    });
});

/* GET / - same as /dashboards/* for user convenience */
router.get('/(*)?', function(req, res, next) {
    renderers.render(req, res, next);
});

module.exports = router;
