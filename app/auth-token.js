/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
 /**
  * Middleware for requiring auth token if provided.
  */
var config = require('./config');

var authToken = config.get('AUTH_TOKEN');
var authMessage = 'Authentication required. Please provide a valid auth token.';

module.exports = function(req, res, next) {
    if (authToken && ('token ' + authToken) !== req.headers.authorization) {
        var err = new Error(authMessage);
        err.status = 401;
        next(err);
    } else {
        next();
    }
};
