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

var dbExt = config.get('DB_FILE_EXT');

/* GET / - render index notebook at home page */
router.get('/', function(req, res, next) {
    renderers.render(req, res, next, {
        dbpath: 'index' + dbExt,
        hideChrome: true,
        errorOnList: true
    });
});

/* GET /dashboards/* - a single dashboard. */
router.get('/dashboards/*', function(req, res, next) {
    renderers.render(req, res, next, {
        hideChrome: true,
        errorOnList: true
    });
});

module.exports = router;
