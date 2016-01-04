/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var nconf = require('nconf');
var hjson = require('hjson');

module.exports = nconf.argv()
                      .env()
                      .file({ file: 'config.json', format: hjson });
