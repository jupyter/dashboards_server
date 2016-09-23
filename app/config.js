/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var nconf = require('nconf');
var hjson = require('hjson');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var debug = require('debug')('dashboard-proxy:config');
var urljoin = require('url-join');

// Config defaults are in an HJSON file in the root of the source tree
var defaultConfig = path.join(__dirname, '..', 'config.json');

// Configure nconf config mechanisms in order of precedence
var config = nconf.use('memory')
                  .argv()
                  .env()
                  .file({ file: defaultConfig, format: hjson });

// Show the config defaults for --help
if(config.get('help')) {
    var text = fs.readFileSync(defaultConfig, 'utf-8');
    console.log(text);
    process.exit(0);
}

// PREFIX_URL modifiers
var prefix_url = config.get('PREFIX_URL');
if (!prefix_url) {
   config.set('PREFIX_URL', '/');
} else {
   var lastChar = prefix_url.substr(-1);
   if (lastChar !== '/') {
      prefix_url = prefix_url + '/';
      config.set('PREFIX_URL', prefix_url);
   }
}

var publicLink = config.get('PUBLIC_LINK_PATTERN');
if (prefix_url) {
   publicLink = urljoin(publicLink , prefix_url);
}
config.set('PUBLIC_LINK_PATTERN', publicLink);

// Shortcut to set local auth strategy with a shared username/password.
// Validation of username/password happens in the auth-local module since it's
// specific to this strategy.
var hasUsername = !!config.get('USERNAME');
var hasPassword = !!config.get('PASSWORD');
if (hasUsername && hasPassword && !config.get('AUTH_STRATEGY')) {
    config.set('AUTH_STRATEGY', './app/auth-local');
}

// build the full path to the data directory
var nbDir = config.get('NOTEBOOKS_DIR');
if(!nbDir) {
    // Use the example data directory in the package by default
    nbDir = path.join(__dirname, '..', 'data');
    config.set('NOTEBOOKS_DIR', nbDir);
} else {
    // Resolve user provided paths relative to the current working dir
    nbDir = path.resolve(nbDir);
    // Create directory if it does not exist
    try {
        var st = fs.statSync(nbDir);
        if (!st.isDirectory()) {
            throw new Error('NOTEBOOKS_DIR "' + nbDir + '" is not a directory.');
        }
    } catch(e) {
        if (e.code === 'ENOENT') {
            // dir doesn't exist; try to create it
            try {
                fs.mkdirSync(nbDir);
            } catch(e) {
                console.error('Failed to create required directory "' + nbDir + '": ' + e.message);
                throw e;
            }
        } else {
            throw e;
        }
    }
    config.set('NOTEBOOKS_DIR', nbDir);
}
debug('resolved NOTEBOOKS_DIR: ' + config.get('NOTEBOOKS_DIR'));

// TODO Move vars to own module
config.set('DB_FILE_EXT', '.ipynb');
config.set('DB_INDEX', 'index.ipynb');
config.set('DB_INDEX_DIR', 'index');

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

// Generate a session key if one is not specified. Log that we did it in case
// the user accidentally left off an explict token.
if(!config.get('SESSION_SECRET_TOKEN')) {
    var bytes = crypto.randomBytes(48);
    config.set('SESSION_SECRET_TOKEN', bytes.toString('hex'));
    console.log('Using generated SESSION_SECRET_TOKEN');
}

module.exports = config;
