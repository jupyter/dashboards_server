/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var config = require('./config');

var PROTOCOL = /\{protocol\}/g;
var HOST = /\{host\}/g;
var PORT = /\{port\}/g;
var BASE_URL = /\{baseUrl\}/g;

var baseUrl = config.get('BASE_URL');

/**
 * Generates a base URL that can be used to build public links. Uses a pattern, such as that
 * specified by the PUBLIC_LINK_PATTERN config parameter. Eg:
 *
 * 	    var url = require('public-link')(req, config.get('PUBLIC_LINK_PATTERN'))
 *
 * @param  {Request|Object} req - Express request used to get protocol and hostname; or object
 *                                containing `host` and `port` (both optional) properties
 * @param  {String} pattern - URL pattern
 * @return {String} public base URL
 * @return {undefined} if `pattern` is not set
 */
module.exports = function(req, pattern) {
    if (pattern) {
        var protocol;
        var host;
        var port;
        if (!!req.headers) { // is Express request
            protocol = req.protocol;
            host = req.headers.host;
            port = req.headers.host.split(':')[1] || '';
        } else {
            protocol = 'http';
            host = req.host || '127.0.0.1';
            port = req.port || '';
        }

        return pattern
            .replace(PROTOCOL, protocol)
            .replace(HOST, host)
            .replace(PORT, port)
            .replace(BASE_URL, baseUrl);
    }
};
