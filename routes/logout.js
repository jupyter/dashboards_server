/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var bodyParser = require('body-parser')
var router = express.Router();

// create application/json parser
var jsonParser = bodyParser.json()

router.get('/', function(req, res) {
  var html = '<form action="/logout" method="post">' +
             '<input type="submit" value="Sign Out">' +
             '</form>';
  if(req.session.username) {
    html += '<br>Signed in as: ' + req.session.username;
  }
  return res.send(html);
});

router.post('/', jsonParser, function(req, res) {
    var session_username = req.session_username;
    req.session.destroy();
    res.redirect('/');
    //return res.status(200).json({"user_status":"User logged out"})
});

module.exports = router;