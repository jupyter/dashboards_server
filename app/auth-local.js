/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
 /**
  * Passport JS strategy for local, shared username/password authentication.
  */
var config = require('./config');
var bodyParser = require('body-parser');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;

// Set "meta-config" values
var hasUsername = !!config.get('USERNAME');
var hasPassword = !!config.get('PASSWORD');
if (hasUsername !== hasPassword) {
    throw new Error('Both USERNAME and PASSWORD must be set');
}

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

module.exports = function(app) {
    // Read shared auth creds from config
    var seedUsername = config.get('USERNAME');
    var seedPassword = config.get('PASSWORD');

    // Render local login form.
    app.get('/login', function(req, res) {
        if(req.user) {
            return res.redirect('/');
        }
        res.render('login', {
            title: 'Log in',
            formAuth: true,
            authError: !!req.flash('error').length
        });
    });

    // Validate login values
    app.post('/login', urlencodedParser, passport.authenticate('local', {
        failureRedirect: '/login',
        successReturnToOrRedirect: '/',
        failureFlash: true
    }));

    // Local auth strategy compares against shared auth creds set in the config
    // at server start time
    return (new Strategy(function(username, password, cb) {
        if (username !== seedUsername) {
            return cb(null, false, {message: 'invalid username'});
        } else if (password !== seedPassword) {
            return cb(null, false, {message: 'invalid password'});
        }
        return cb(null, {username: username});
    }));
};
