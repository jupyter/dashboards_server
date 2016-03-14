/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Example: Passport JS strategy for Twitter OAuth.
 * Requires additional configuration and npm packages. See
 * https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication
 * for details.
 */
var config = require('./config');
var bodyParser = require('body-parser');
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;

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
            provider_id: 'twitter', // when the user presses the login button goes to /login/{{provider_id}}
            provider_name: 'Twitter' // name to show on the button
        });
    });

    // Do the twitter oauth dance.
    app.get('/login/twitter', passport.authenticate('twitter'));
    app.get('/login/twitter/callback',
        passport.authenticate('twitter', {
            failureRedirect: '/login',
            successReturnToOrRedirect: '/'
        })
    );

    return(new TwitterStrategy({
        consumerKey: config.get('TWITTER_CONSUMER_KEY'),
        consumerSecret: config.get('TWITTER_CONSUMER_SECRET'),
        callbackURL: config.get('TWITTER_CALLBACK_URL')
    }, function(token, tokenSecret, profile, done) {
        return done(null, {
            token: token,
            tokenSecret: tokenSecret,
            username: profile.username
        });
    }));
};
