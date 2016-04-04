/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var nconf = require('nconf');
var hjson = require('hjson');
var path = require('path');
var fs = require('fs');

var config = nconf.argv()
                  .env()
                  .file({ file: 'config.json', format: hjson });

// Shortcut to set local auth strategy with a shared username/password.
// Validation of username/password happens in the auth-local module since it's
// specific to this strategy.
var hasUsername = !!config.get('USERNAME');
var hasPassword = !!config.get('PASSWORD');
if (hasUsername && hasPassword && !config.get('AUTH_STRATEGY')) {
    config.set('AUTH_STRATEGY', './app/auth-local');
}

// build the full path to the data directory
config.set('NOTEBOOKS_DIR', path.join(__dirname, '..', config.get('NOTEBOOKS_DIR')));

// TODO Move vars to own module
config.set('DB_FILE_EXT', '.ipynb');
config.set('DB_INDEX', 'index.ipynb');

var key_file_location = config.get('HTTPS_KEY_FILE');
var cert_file_location = config.get('HTTPS_CERT_FILE');
//if both key and cert locations are set use them and run in https mode
if (key_file_location || cert_file_location) {
    if(!fs.existsSync(key_file_location)) {
        throw new Error('Invalid file path for HTTPS_KEY_FILE');
    }
    if(!fs.existsSync(cert_file_location)) {
        throw new Error('Invalid file path for HTTPS_CERT_FILE');
    }
    config.set('SSL_OPTIONS', {
       key: fs.readFileSync(key_file_location),
       cert: fs.readFileSync(cert_file_location)
    });
}

module.exports = config;
