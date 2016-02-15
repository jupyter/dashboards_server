/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var nconf = require('nconf');
var hjson = require('hjson');

var config = nconf.argv()
                  .env()
                  .file({ file: 'config.json', format: hjson });

// Set "meta-config" values
var hasUsername = !!config.get('USERNAME');
var hasPassword = !!config.get('PASSWORD');
if (hasUsername !== hasPassword) {
    throw new Error('Both USERNAME and PASSWORD must be set');
}
config.set('AUTH_ENABLED', hasUsername && hasPassword);

// ensure file extension starts with a dot
var ext = config.get('DB_FILE_EXT');
if (!/^\./.test(ext)) {
    config.set('DB_FILE_EXT', '.' + ext);
}

module.exports = config;
