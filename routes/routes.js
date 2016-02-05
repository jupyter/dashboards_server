/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Normal routes that require login (if enabled)
 */
var authToken = require('../app/auth-token');
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:router');
var nbstore = require('../app/notebook-store');
var router = require('express').Router();

var authEnabled = config.get('AUTH_ENABLED');
var indexRegex = /index\.ipynb/i;

function _renderList(req, res, list) {
    // render a list of all notebooks
    res.status(200);
    res.render('list', {
        username: req.session.username,
        authEnabled: authEnabled,
        notebooks: list
    });
}

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            // if index notebook exists redirect to it immediately
            var indexFound;
            for (var i=0; i<notebooks.length; i++) {
                if (indexRegex.test(notebooks[i])) {
                    indexFound = notebooks[i];
                    break;
                }
            }
            if (indexFound) {
                // redirect to the index notebook
                res.redirect('/dashboards/' + indexFound);
            } else {
                _renderList(req, res, notebooks);
            }
        },
        function error(err) {
            console.error('Error loading list of notebooks',err);
            next(err);
        }
    );
});

/* GET /dashboards - list of notebooks */
router.get('/dashboards', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            _renderList(req, res, notebooks);
        },
        function error(err) {
            console.error('Error loading list of notebooks',err);
            next(err);
        }
    );
});

/* GET /dashboards/* - a single dashboard. */
router.get('/dashboards/*', function(req, res, next) {
    var path = req.params[0];
    if (path) {
        nbstore.get(path).then(
            function success(notebook) {
                debug('Success loading nb');
                res.status(200);
                res.render('dashboard', {
                    title: 'Dashboard',
                    notebook: notebook,
                    username: req.session.username,
                    authEnabled: config.get('AUTH_ENABLED')
                });
            },
            function error(err) {
                console.error('error loading nb',err);
                // TODO better way of determing the error
                err.status = err.message.indexOf('loading') === -1 ? 500 : 404;
                next(err);
            }
        );
    } else {
        // redirect to list page when no path specified
        res.redirect('/dashboards');
    }
});

module.exports = router;
