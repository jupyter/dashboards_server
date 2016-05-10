/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/**
 * Appends the specified extension if necessary.
 */
var path = require('path');
var DB_EXT = require('./config').get('DB_FILE_EXT');
module.exports = function (nbpath, ext) {
    ext = ext || '';
    return nbpath + (path.extname(nbpath) === ext ? '' : ext);
};
