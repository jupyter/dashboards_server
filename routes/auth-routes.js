/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Routes that make use of auth token
 */
var authToken = require('../app/auth-token');
var config = require('../app/config');
var nbstore = require('../app/notebook-store');
var path = require('path');
var router = require('express').Router();
var urljoin = require('url-join');

var GET_URL = urljoin(config.get('PUBLIC_LINK'), '/dashboards');
var UPLOAD_MESSAGE = 'Notebook successfully uploaded';

/* POST /notebooks/* - upload a dashboard notebook */
router.post('/notebooks(/*)', authToken, nbstore.upload, function(req, res) {
    var basename = path.basename(req.params[0], path.extname(req.params[0]));
    var resBody = {
        link: urljoin(GET_URL, basename),
        message: UPLOAD_MESSAGE,
        status: 201,
        url: req.url
    };
    res.status(201).json(resBody);
});

module.exports = router;
