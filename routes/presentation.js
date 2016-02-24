/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Presentation routes. Only renders notebook in root directory.
 */
var renderers = require('./renderers');
var router = require('express').Router();

router.get('/', function(req, res, next) {
    renderers.renderDashboard(req, res, next, 'index.ipynb', true);
});

router.get('/*', function(req, res) {
    res.redirect('/');
});

module.exports = router;
