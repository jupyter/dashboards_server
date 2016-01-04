/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var express = require('express');
var nbstore = require('../app/notebook-store');

var router = express.Router();

/* GET / - redirect to notebook list page */
router.get('/', function(req, res) {
    res.redirect('/notebooks');
});

/* GET /notebooks - list of notebooks */
router.get('/notebooks', function(req, res) {
    res.render('index', {
        title: 'Notebooks'
    });
});

function handleNotebookError(res, status, err) {
    res.status(status);
    res.render('error', {
        message: err.message,
        error: err,
        title: 'error'
    });
}

/* GET /notebooks/* - a single notebook. */
router.get('/notebooks/*', function(req, res) {
    var path = req.params[0];
    if (path) {
        nbstore.get(path).then(
            function success(notebook) {
                console.log('success loading nb');
                res.status(200);
                res.render('dashboard', {
                    title: 'Dashboard',
                    notebook: notebook
                });
            },
            function error(err) {
                console.error('error loading nb',err);
                // TODO better way of determing the error
                var status = err.message.indexOf('loading') === -1 ? 500 : 404;
                handleNotebookError(res, status, err);
            }
        );
    } else {
        // redirect to home page when no path specified
        res.redirect('/');
    }
});

module.exports = router;
