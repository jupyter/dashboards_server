/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var bodyParser = require('body-parser');
var router = express.Router();

// create application/json parser
var jsonParser = bodyParser.json();

router.post('/', jsonParser, function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;