/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var fs = require('fs');
var path = require('path');
var Promise = require('es6-promise').Promise;

var config = require('./config');

var store = {};

function _loadNb(nbpath) {
    return new Promise(function(resolve, reject) {
        var ipynb = /\.ipynb$/.test(nbpath) ? '' : '.ipynb';
        var nbdir = config.get('NOTEBOOKS_DIR');
        var nbPath = path.join(__dirname, nbdir, nbpath + ipynb);
        console.info('Attempting to load notebook file:', nbPath);
        fs.readFile(nbPath, 'utf8', function(err, rawData) {
            if (err) {
                reject(new Error('Error loading notebook file'));
            } else {
                try {
                    var nb = JSON.parse(rawData);
                    store[nbpath] = nb;
                    resolve(nb);
                    console.log('resolving nb load');
                } catch(e) {
                    reject(new Error('Error parsing notebook file'));
                }
            }
        });
    });
}

function get(nbpath) {
    return new Promise(function(resolve, reject) {
        if (store.hasOwnProperty(nbpath)) {
            resolve(store[nbpath]);
        } else {
            resolve(_loadNb(nbpath));
        }
    });
}

function remove(nbpath) {
    delete store[nbpath];
}

module.exports = {
    /**
     * Loads, parses, and returns cells (minus code) of the notebook specified by nbpath.
     * @param  {String} nbpath - path of the notbeook to load
     * @return {Promise} ES6 Promise resolved with notebook JSON or error string
     */
    get: get,
    remove: remove
};
