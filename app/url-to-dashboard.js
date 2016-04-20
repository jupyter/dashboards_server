/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var config = require('../app/config');

var dbExt = config.get('DB_FILE_EXT');
var _dbMap = {
    '': 'index' + dbExt
};

/**
 * Map specific URL to dashboard
 */
module.exports = function(url) {
    return _dbMap[url] || url;
};
