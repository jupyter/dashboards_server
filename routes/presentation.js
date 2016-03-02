/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Presentation routes. Only renders notebook in root directory.
 */
var config = require('../app/config');
var renderers = require('./renderers');
var router = require('express').Router();

/* GET / - index notebook */
router.get('/', function(req, res, next) {
    renderers.render(req, res, next, {
        hideChrome: true,
        errorOnList: true
    });
});

/* GET /dashboards/* - a single dashboard. */
router.get('/dashboards(/*)?', function(req, res, next) {
    renderers.render(req, res, next, {
        hideChrome: true,
        errorOnList: true
    });
});

module.exports = router;
