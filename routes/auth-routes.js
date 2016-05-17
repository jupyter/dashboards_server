/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Routes that make use of auth token
 */
var authToken = require('../app/auth-token');
var config = require('../app/config');
var link = require('../app/public-link');
var upload = require('../app/notebook-upload');
var router = require('express').Router();
var urljoin = require('url-join');

var UPLOAD_MESSAGE = 'Notebook successfully uploaded';

/* POST /notebooks/* - upload a dashboard notebook */
router.post('/notebooks(/*)', authToken, upload, function(req, res) {
    var publicLink = link(req);
    var resBody = {
        message: UPLOAD_MESSAGE,
        status: 201,
        url: req.url
    };
    if (publicLink) {
        resBody.link = urljoin(publicLink, 'dashboards', req.params[0]);
    }
    res.status(201).json(resBody);
});

module.exports = router;
