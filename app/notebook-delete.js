/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var appendExt = require('./append-ext');
var config = require('./config');
var nbfs = require('../app/notebook-fs');
var nbstore = require('./notebook-store');
var path = require('path');
var rimraf = require('rimraf');

var DATA_DIR = config.get('NOTEBOOKS_DIR');
var DB_EXT = config.get('DB_FILE_EXT');

module.exports = function(req, res, next) {
    var target = path.join(DATA_DIR, req.params[0]);
    var cachedPath = req.params[0];

    nbfs.stat(target)
        .then(function success(stats) {
            if (!stats.isDashboard) {
                res.status(400).send('Resource to be deleted must be a dashboard');
                return;
            }

            if (stats.isFile()) {
                target = appendExt(target, DB_EXT);
            }

            rimraf(target, { disableGlob: true }, function(err) {
                if (err) {
                    res.status(500).send('Server failed to delete resource: ' + err.message);
                    return;
                }

                // successfully delete; now clear the notebook cache
                nbstore.uncache(cachedPath);

                // associated running kernels will be automatically reaped after a timeout

                res.sendStatus(204);
            });
        })
        .catch(function failure(err) {
            res.status(500).send('Server failed to delete resource: ' + err.message);
        });
};
