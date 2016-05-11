/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var config = require('./config');

var PUBLIC_LINK_PATTERN = config.get('PUBLIC_LINK_PATTERN');
var PROTOCOL = /\{protocol\}/g;
var HOST = /\{host\}/g;
var PORT = /\{port\}/g;

/**
 * Generates a base URL that can be used to build public links. Uses the pattern
 * specified by the PUBLIC_LINK_PATTERN config parameter.
 * @param  {Request} req - Express request used to get protocol and hostname
 * @return {String} public base URL
 * @return {undefined} if PUBLIC_LINK_PATTERN is not set
 */
module.exports = function(req) {
    if (PUBLIC_LINK_PATTERN) {
        return PUBLIC_LINK_PATTERN
            .replace(PROTOCOL, req.protocol)
            .replace(HOST, req.headers.host)
            .replace(PORT, req.headers.host.split(':')[1] || '');
    }
};
