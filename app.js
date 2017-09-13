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

// check if we're configured to server under prefixed path
var dbserver = app;
var baseUrl = config.get('BASE_URL');
var removePrefix = config.get('REMOVE_PREFIX');
if (baseUrl && !removePrefix) {
    debug('Serving paths with base path ' + baseUrl);
    dbserver = express.Router();
    app.use(baseUrl, dbserver);
}

//////////////
// ENVIRONMENT
//////////////

var env = config.get('NODE_ENV') || 'development';
app.locals.ENV = env;
app.locals.ENV_DEVELOPMENT = env == 'development';
debug('Using environment ' + env);

/////////
// PROXY
/////////

app.set('trust proxy', config.get('TRUST_PROXY'));

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

dbserver.use(logger('dev'));
dbserver.use(cookieParser());
dbserver.use(flash());
dbserver.use(express.static(path.join(__dirname, 'public')));
dbserver.use(favicon(__dirname + '/public/favicon.ico', { maxAge: 604800000})); // maxAge: 1 week

// redirect trailing slash
dbserver.use(function(req, res, next) {
    var url = req.url;
    if (url.substr(-1) === '/' && url.length > 1) {
        // baseUrl + url is necessary to accomodate when server running from prefixed URL
        // (see BASE_URL in config.json)
        res.redirect(301, urljoin(req.baseUrl, url.slice(0, -1)));
    } else {
        next();
    }
});

// cookie session configuration
dbserver.use(cookieSession({
    secret: config.get('SESSION_SECRET_TOKEN'),
    cookie: {maxAge: 24*3600*1000} //cookie max age set to one day
}));

///////////////////////////////////////
// PUBLIC ROUTES (auth token, no login)
///////////////////////////////////////

dbserver.use('/_api', authRoutes);

////////
// AUTHENTICATION
////////

if(config.get('AUTH_STRATEGY')) {
    // Initialize passport and restore auth state from session
    dbserver.use(passport.initialize());
    dbserver.use(passport.session());

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
    dbserver.all('/logout', function(req, res) {
        req.session = null;
        res.redirect('/');
    });
    // Ensure login on all following routes
    dbserver.use(ensureLoggedIn());
    // Pass passport user object to all views
    dbserver.use(function(req, res, next) {
        res.locals.user = req.user;
        next();
    });
}

///////////////////////
// AUTHENTICATED ROUTES
///////////////////////

if (config.get('PRESENTATION_MODE')) {
    dbserver.use('/', presentationRoutes);
} else {
    dbserver.use('/', routes);
}
dbserver.use('/api', apiRoutes);


/////////////////
// ERROR HANDLING
/////////////////

// forward 404 to error handler
dbserver.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// general error handling
dbserver.use(function(err, req, res, next) {
    var stacktrace = '';
    var status = err.status || 500;
    if (app.get('env') === 'development') {
        // send stacktrace in development mode
        stacktrace = err.stack;
        if (status >= 500 && status < 600) {
            console.log('STACK:', err.stack);
            console.log('ERROR:', err);
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
