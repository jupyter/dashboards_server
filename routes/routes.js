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

/* GET / - index notebook or list of notebooks */
router.get('/', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            //if notebook index exists redirect to it immediately
            var notebookIndex = "index.ipynb";
            //ensure notebook index search is case insensitive
            var indexFound = -1;
            for(var i=0; i<notebooks.length; i++) {
                if(notebooks[i].toLowerCase() === notebookIndex) {
                    indexFound = i;
                    break;
                }
            }
            if(indexFound > -1) {
                //redirect to the index notebook
                res.redirect('/notebooks/' + notebooks[indexFound]);
            }
            else {
                //render a list of all notebooks
                res.render('list', {
                    username: req.session.username,
                    authEnabled: config.get('AUTH_ENABLED'),
                    notebooks: notebooks
                });
            }
        },
        function error(err) {
            console.error('Error loading list of notebooks',err);
            next(err);
        }
    );
});

/* GET /notebooks - list of notebooks */
router.get('/notebooks', function(req, res, next) {
    nbstore.list().then(
        function success(notebooks) {
            //render a list of all notebooks
            res.render('list', {
                username: req.session.username,
                authEnabled: config.get('AUTH_ENABLED'),
                notebooks: notebooks
            });
        },
        function error(err) {
            console.error('Error loading list of notebooks',err);
            next(err);
        }
    );
});

/* GET /notebooks/* - a single notebook. */
router.get('/notebooks/*', function(req, res, next) {
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
        // redirect to home page when no path specified
        res.redirect('/');
    }
});

module.exports = router;
