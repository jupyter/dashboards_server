/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Example: Passport JS strategy for Auth0.
 * Requires additional configuration and npm packages. See
 * https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication
 * for details.
 */
var url = require('url');
var config = require('./config');
var passport = require('passport');
var Auth0Strategy = require('passport-auth0');

module.exports = function(app) {

    app.get('/callback',
        passport.authenticate('auth0', { failureRedirect: '/login' }),
        function(req, res) {
            if (!req.user) {
                throw new Error('User name must be set');
            }
            res.redirect("/");
        }
    );

    app.get('/login',
        passport.authenticate('auth0', {}), function (req, res) {
            res.redirect("/");
    });

    app.post('/logout', function(req, res){
        req.logout();
        var logout_obj_url = {
            host: config.get('AUTH0_DOMAIN'),
            pathname: '/v2/logout',
            query: {
                'returnTo': config.get('PUBLIC_LINK_PATTERN'),
                'client_id': config.get('AUTH0_CLIENT_ID'),
            }
        };
        var logout_url = url.format(logout_obj_url);
        res.redirect(logout_url);
    });

    var strategy = new Auth0Strategy({
       domain:       config.get('AUTH0_DOMAIN'),
       clientID:     config.get('AUTH0_CLIENT_ID'),
       clientSecret: config.get('AUTH0_CLIENT_SECRET'),
       callbackURL:  config.get('AUTH0_CALLBACK_URL')
      },
      function(accessToken, refreshToken, extraParams, profile, done) {
        // accessToken is the token to call Auth0 API (not needed in the most cases)
        // extraParams.id_token has the JSON Web Token
        // profile has all the information from the user
        return done(null, profile);
      }
    );

    // passport.use(strategy);

    return strategy;
};
