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
var nbdelete = require('../app/notebook-delete');
var nbstore = require('../app/notebook-store');
var upload = require('../app/notebook-upload');
var router = require('express').Router();
var urljoin = require('url-join');

var PUBLIC_LINK_PATTERN = config.get('PUBLIC_LINK_PATTERN');
var UPLOAD_MESSAGE = 'Notebook successfully uploaded';

/* POST /notebooks/* - upload a dashboard notebook */
router.post('/notebooks(/*)', authToken, upload, function(req, res) {
    var publicLink = link(req, PUBLIC_LINK_PATTERN);
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

/* DELETE /notebooks/* - delete a dashboard notebook */
router.delete('/notebooks(/*)', authToken, nbdelete);

/* DELETE /cache/* - reset the cache or remove a specific entry from cache */
router.delete('/cache(/*)?', authToken, function(req, res) {
    var path = req.params[0];
    if (path) {
        nbstore.uncache(path);
    } else {
        nbstore.resetCache();
    }
    res.sendStatus(200);
});

module.exports = router;
