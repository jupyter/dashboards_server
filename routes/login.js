/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var nconf = require('nconf');
var express = require('express');
var bodyParser = require('body-parser')
var router = express.Router();

// create application/json parser
var jsonParser = bodyParser.json()
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })

var redirect_back = function(req, res) {
    var redirect_after_login = req.session.redirect_after_login ? req.session.redirect_after_login : '/';
    delete req.session.redirect_after_login;
    res.redirect(redirect_after_login);
};

router.get('/', function(req, res) {
  var html = '<form action="/login" method="post">' +
             'User Name: <input type="text" name="username"><br>' +
             'Password: <input type="password" name="password"><br>' +
             '<input type="submit" value="Sign in">' +
             '</form>';
  if(req.session.username) {
    html += '<br>Signed in as: ' + req.session.username;
  }
  return res.send(html);
});

router.post('/', urlencodedParser, function(req, res) {
    if (!req.body) return res.sendStatus(400)
    var seed_username = nconf.get('USERNAME');
    var seed_password = nconf.get('PASSWORD');

    //if not logged in already
    if(!req.session.username) {
        //if username/password match
        if(seed_username === req.body.username && seed_password === req.body.password) {
            req.session.username = req.body.username;
            redirect_back(req, res);
        }
        else {
            return res.redirect(401, '/login');
        }
    }
    //already logged in
    else {
        redirect_back(req, res);
    }
});

module.exports = router;