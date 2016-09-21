/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var cookieSession = require('cookie-session');
var exphbs  = require('express-handlebars');
var debug = require('debug')('dashboard-proxy:server');
var passport = require('passport');
var ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn;
var favicon = require('serve-favicon');
var flash = require('connect-flash');

var hbsHelpers = require('./app/handlebars-helpers');
var config = require('./app/config');

var routes = require('./routes/routes');
var authRoutes = require('./routes/auth-routes');
var apiRoutes = require('./routes/api');
var presentationRoutes = require('./routes/presentation');

var app = express();

//////////////
// ENVIRONMENT
//////////////

var env = config.get('NODE_ENV') || 'development';
app.locals.ENV = env;
app.locals.ENV_DEVELOPMENT = env == 'development';
debug('Using environment ' + env);

var base_url = config.get('BASE_URL');

//////////////
// VIEW ENGINE
//////////////

app.engine('handlebars', exphbs({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views', 'layouts'),
    partialsDir: path.join(__dirname, 'views', 'partials'),
    helpers: hbsHelpers
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'handlebars');

//////////////////
// MISC MIDDLEWARE
//////////////////

app.use(base_url, logger('dev'));
app.use(base_url, cookieParser());
app.use(base_url, flash());

app.use(base_url, express.static(path.join(__dirname, 'public')));
app.use(base_url, favicon(__dirname + '/public/favicon.ico', { maxAge: 604800000})); // maxAge: 1 week

// redirect trailing slash
app.use(base_url, function(req, res, next) {
   if(req.url.substr(-1) === '/' && req.url.length > 1) {
       res.redirect(301, req.url.slice(0, -1));
   } else {
       next();
   }
});

// cookie session configuration
app.use(base_url, cookieSession({
    secret: config.get('SESSION_SECRET_TOKEN'),
    cookie: {maxAge: 24*3600*1000} //cookie max age set to one day
}));

///////////////////////////////////////
// PUBLIC ROUTES (auth token, no login)
///////////////////////////////////////

app.use(base_url + '_api', authRoutes);

////////
// AUTHENTICATION
////////

if(config.get('AUTH_STRATEGY')) {
    // Initialize passport and restore auth state from session
    app.use(passport.initialize());
    app.use(passport.session());

    // Load auth strategy based on config
    var strategy = require(config.get('AUTH_STRATEGY'))(app);
    passport.use(strategy);

    // Store passport user object in memory only for now
    passport.serializeUser( function(user, done) {
    	done(null, user);
    });
    passport.deserializeUser( function(obj, done) {
    	done(null, obj);
    });

    // Destroy session on any attempt to logout
    app.all('/logout', function(req, res) {
        req.session = null;
        res.redirect('/');
    });
    // Ensure login on all following routes
    app.use(ensureLoggedIn());
    // Pass passport user object to all views
    app.use(function(req, res, next) {
        res.locals.user = req.user;
        next();
    });
}

///////////////////////
// AUTHENTICATED ROUTES
///////////////////////

if (config.get('PRESENTATION_MODE')) {
    app.use(base_url, presentationRoutes);
} else {
    app.use(base_url, routes);
}
app.use(base_url + 'api', apiRoutes);


/////////////////
// ERROR HANDLING
/////////////////

// forward 404 to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// general error handling
app.use(function(err, req, res, next) {
    var stacktrace = '';
    var status = err.status || 500;
    if (app.get('env') === 'development') {
        // send stacktrace in development mode
        stacktrace = err.stack;
        if (status >= 500 && status < 600) {
            console.log('STACK:', err.stack);
        }
    }

    res.status(status);

    // default to json, only send html if explicitly requested
    if (req.accepts('html') &&
        !(req.accepts().length === 1 && req.accepts('*/*'))) {
        res.render('error', {
            title: 'error',
            status: status,
            message: err.message,
            stacktrace: stacktrace
        });
    } else {
        var body = {
            message: err.message,
            status: status,
            error: err,
            url: req.url
        };
        if (stacktrace) {
            body.stacktrace = stacktrace;
        }
        res.send(body);
    }
});

module.exports = app;
