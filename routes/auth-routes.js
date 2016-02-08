/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Routes that make use of auth token
 */
var authToken = require('../app/auth-token');
var nbstore = require('../app/notebook-store');
var router = require('express').Router();

/* POST /notebooks/* - upload a dashboard notebook */
router.post('/notebooks/*', authToken, nbstore.upload, function(req, res) {
    res.status(201).json({
        url: req.url,
        status: 201,
        message: 'Notebook successfully uploaded.'
    });
});

module.exports = router;
