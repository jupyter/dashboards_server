/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var session = require('express-session')
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var exphbs  = require('express-handlebars');
var debug = require('debug')('dashboard-proxy:server');

var hbsHelpers = require('./app/handlebars-helpers');
var config = require('./app/config');

var routes = require('./routes/index');
var apiRoutes = require('./routes/api');
var loginRoutes = require('./routes/login');
var logoutRoutes = require('./routes/logout');

var app = express();
var router = express.Router();

var env = config.get('NODE_ENV') || 'development';
app.locals.ENV = env;
app.locals.ENV_DEVELOPMENT = env == 'development';
debug('Using environment ' + env);

// view engine setup
app.engine('handlebars', exphbs({
    defaultLayout: 'main',
    partialsDir: ['views/partials/'],
    helpers: hbsHelpers
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'handlebars');

app.use(logger('dev'));

// DON'T USE THESE when proxying.
// The bodyParser changes the request, but we need to pass as is when proxying.
// // TODO: For some reason, XHR calls from jupyter-js-services are called with
// // content type of `text/plain;charset=UTF-8` instead of a JSON type. Normally,
// // we would use `bodyParser.json()` here, but instead we have to use `text()`
// // because of this and parse ourselves.
// app.use(bodyParser.text());
// app.use(bodyParser.urlencoded({ extended: false }));
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

app.use(cookieParser());

var secret_token = config.get('SESSION_SECRET_TOKEN') || 'secret_token';

app.use(session({
        secret: secret_token,
        cookie: {maxAge: 24*3600*1000},//cookie max age set to one day
        resave: true,
        saveUninitialized: true
        }));

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
    app.use('/login', loginRoutes);
    app.use('/logout', logoutRoutes);

    //routes registered below this filter will require a valid session value/user
    app.all('*',function(req,res,next){
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

app.use('/', routes);
app.use('/api', apiRoutes);

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err,
            title: 'error'
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {},
        title: 'error'
    });
});

module.exports = app;
