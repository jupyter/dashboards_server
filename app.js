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
var urljoin = require('url-join');

var hbsHelpers = require('./app/handlebars-helpers');
var config = require('./app/config');

var routes = require('./routes/routes');
var authRoutes = require('./routes/auth-routes');
var apiRoutes = require('./routes/api');
var presentationRoutes = require('./routes/presentation');

var app = express();
var prefixRouter = express.Router();

var prefixUrl = config.get('PREFIX_URL');
app.use(prefixUrl, prefixRouter);

//////////////
// ENVIRONMENT
//////////////

var env = config.get('NODE_ENV') || 'development';
app.locals.ENV = env;
app.locals.ENV_DEVELOPMENT = env == 'development';
debug('Using environment ' + env);

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

prefixRouter.use(logger('dev'));
prefixRouter.use(cookieParser());
prefixRouter.use(flash());
prefixRouter.use(express.static(path.join(__dirname, 'public')));
prefixRouter.use(favicon(__dirname + '/public/favicon.ico', { maxAge: 604800000})); // maxAge: 1 week

// redirect trailing slash
prefixRouter.use(function(req, res, next) {
   if(req.url.substr(-1) === '/' && req.url.length > 1) {
       res.redirect(301, req.url.slice(0, -1));
   } else {
       next();
   }
});

// cookie session configuration
prefixRouter.use(cookieSession({
    secret: config.get('SESSION_SECRET_TOKEN'),
    cookie: {maxAge: 24*3600*1000} //cookie max age set to one day
}));

///////////////////////////////////////
// PUBLIC ROUTES (auth token, no login)
///////////////////////////////////////

prefixRouter.use('/_api', authRoutes);

////////
// AUTHENTICATION
////////

if(config.get('AUTH_STRATEGY')) {
    // Initialize passport and restore auth state from session
    prefixRouter.use(passport.initialize());
    prefixRouter.use(passport.session());

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
    prefixRouter.all('/logout', function(req, res) {
        req.session = null;
        res.redirect('/');
    });
    // Ensure login on all following routes
    prefixRouter.use(ensureLoggedIn());
    // Pass passport user object to all views
    prefixRouter.use(function(req, res, next) {
        res.locals.user = req.user;
        next();
    });
}

///////////////////////
// AUTHENTICATED ROUTES
///////////////////////

if (config.get('PRESENTATION_MODE')) {
    prefixRouter.use('/', presentationRoutes);
} else {
    prefixRouter.use('/', routes);
}
prefixRouter.use('/api', apiRoutes);


/////////////////
// ERROR HANDLING
/////////////////

// forward 404 to error handler
prefixRouter.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// general error handling
prefixRouter.use(function(err, req, res, next) {
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
