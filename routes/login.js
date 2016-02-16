/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var config = require('../app/config');
var express = require('express');
var bodyParser = require('body-parser');
var router = express.Router();

// create application/json parser
var jsonParser = bodyParser.json();
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

var redirectBack = function(req, res) {
    var redirectAfterLogin = req.session.redirectAfterLogin || '/';
    delete req.session.redirectAfterLogin;
    res.redirect(redirectAfterLogin);
};

router.get('/', function(req, res) {
    res.status(200);
    res.render('login', {
        username: req.session.username,
        title: 'Log in'
    });
});

router.post('/', urlencodedParser, function(req, res) {
    if (!req.body) {
        return res.sendStatus(400);
    }
    var seedUsername = config.get('USERNAME');
    var seedPassword = config.get('PASSWORD');

    //if not logged in already
    if(!req.session.username) {
        //if username/password match
        if (seedUsername === req.body.username &&
            seedPassword === req.body.password) {
            req.session.username = req.body.username;
            redirectBack(req, res);
        } else {
            res.render('login', {
                username: req.session.username,
                authError: true,
                title: 'Invalid credentials'
            });
        }
    } else {
        //already logged in
        redirectBack(req, res);
    }
});

module.exports = router;
