/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var session = require('express-session');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var exphbs  = require('express-handlebars');
var debug = require('debug')('dashboard-proxy:server');

var hbsHelpers = require('./app/handlebars-helpers');
var config = require('./app/config');

var routes = require('./routes/routes');
var authRoutes = require('./routes/auth-routes');
var apiRoutes = require('./routes/api');
var loginRoutes = require('./routes/login');
var logoutRoutes = require('./routes/logout');

var app = express();

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
    partialsDir: ['views/partials/'],
    helpers: hbsHelpers
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'handlebars');

//////////////////
// MISC MIDDLEWARE
//////////////////

app.use(logger('dev'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// redirect trailing slash
app.use(function(req, res, next) {
   if(req.url.substr(-1) === '/' && req.url.length > 1) {
       res.redirect(301, req.url.slice(0, -1));
   } else {
       next();
   }
});

var sessionSecret = config.get('SESSION_SECRET_TOKEN') || 'secret_token';
app.use(session({
    secret: sessionSecret,
    cookie: {maxAge: 24*3600*1000},//cookie max age set to one day
    resave: true,
    saveUninitialized: true
}));

///////////////////////////////////////
// PUBLIC ROUTES (auth token, no login)
///////////////////////////////////////

app.use('/_api', authRoutes);

////////
// LOGIN
////////

var seedUsername = config.get('USERNAME');
var seedPassword = config.get('PASSWORD');
//if username supplied but not password throw error
if(seedUsername && seedUsername !== "" && (!seedPassword || seedPassword === "")) {
    throw new Error('Error, Username exists but Password is missing');
}
//if password supplied but not user throw error
if(seedPassword && seedPassword !== "" && (!seedUsername || seedUsername === "")) {
    throw new Error('Error, Password exists but Username is missing');
}
//if username and password supplied, enable auth
else if(seedUsername && seedUsername !== "" && seedPassword && seedPassword !== "") {
    config.set('AUTH_ENABLED', true);
    app.use('/login', loginRoutes);
    app.use('/logout', logoutRoutes);

    //routes registered below this filter will require a valid session value/user
    app.all('*',function(req,res,next) {
        if(req.session.username) {
            next();
        }
        else {
            //save the previous page in the session to know where to redirect back to after login
            req.session.redirectAfterLogin = req.path;
            res.redirect('/login');
        }
    });
}

///////////////////////
// AUTHENTICATED ROUTES
///////////////////////

app.use('/', routes);
app.use('/api', apiRoutes);

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
