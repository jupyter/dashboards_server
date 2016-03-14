/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Example: Passport JS strategy for Box OAuth.
 * Requires additional configuration and npm packages. See
 * https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication
 * for details.
 */
var config = require('./config');
var bodyParser = require('body-parser');
var passport = require('passport');
var BoxStrategy = require('passport-box').Strategy;

module.exports = function(app) {
    // Render a landing page so the user doesn't immediately go to twitter.
    app.get('/login', function(req, res) {
        // Don't bother if the user is already authenticated.
        if(req.user) {
            return res.redirect('/');
        }
        // Render the simple view included in the server. Substitute a custom
        // view here as needed.
        res.render('login', {
            title: 'Log in',
            provider_id: 'box', // when the user presses the login button goes to /login/{{provider_id}}
            provider_name: 'box' // name to show on the button
        });
    });

    // Do the oauth box dance.
    app.get('/login/box', passport.authenticate('box'));
    app.get('/login/box/callback',
        passport.authenticate('box', {
            failureRedirect: '/login',
            successReturnToOrRedirect: '/'
        })
    );

    return(new BoxStrategy({
        clientID: config.get('BOX_CLIENT_ID'),
        clientSecret: config.get('BOX_CLIENT_SECRET'),
        callbackURL: config.get('BOX_CALLBACK_URL')
    }, function(accessToken, refreshToken, profile, done) {
        return done(null, {
            accessToken: accessToken,
            refreshToken: refreshToken,
            username: profile.login
        });
    }));
};
