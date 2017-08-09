/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Example: Passport JS strategy for LDAP Auth
 * Requires additional configuration and npm packages. See
 * https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication
 * for details
 */

var config = require('./config');
var bodyParser = require('body-parser');
var passport = require('passport');
var LdapStrategy = require('passport-ldapauth')

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

module.exports = function(app) {
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

	app.post('/login', urlencodedParser, passport.authenticate('ldapauth', {
		usernameField:"username",
		passwordField:"password",
		failureRedirect: '/login',
		successReturnToOrRedirect: '/',
		failureFlash: true
	}), function (req, res) {
		res.send({status: 'ok'});
	});

	return(new LdapStrategy({
		server: {
			url: config.get("LDAP_URL"),
			searchBase: config.get("LDAP_BASE_DN"),
			bindDN: config.get("LDAP_USER_NAME"),
			bindCredentials: config.get("LDAP_PASSWORD"),
			searchFilter: config.get("LDAP_SEARCH_FILTER")
		},
	}, function (user, done) {
		return done(null, {
			username: user.sAMAccountName
		})
	}));
};
