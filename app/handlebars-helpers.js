/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var commonmark = require('commonmark');
var config = require('./config');

var reader = new commonmark.Parser();
var writer = new commonmark.HtmlRenderer();

module.exports = {
    config: function(name) {
        return config.get(name);
    },

    fsIcon: function(type) {
        var value = '';
        if (type === 'directory') {
            value = 'fa fa-folder-o';
        } else if (type === 'file') {
            value = 'fa fa-file-o';
        } else if (type === 'dashboard') {
            value = 'fa fa-dashboard';
        }
        return value;
    },

    mapCellType: function(cellType) {
        return cellType === 'markdown' ? 'text-cell rendered_html' : 'code-cell';
    },

    markdownContent: function(cellType, source) {
        if (cellType !== 'markdown') {
            return '';
        }

        if (Array.isArray(source)) {
            source = source.join('');
        }

        var parsed = reader.parse(source);
        return writer.render(parsed);
    },

    urlBasename: function(url) {
        return url.split('/').pop();
    },

    basename: function(url) {
        if (!url) {
            return [];
        } else {
            var split = url.replace(/\/+/g, '/').split('/');
            return split.map(function(d, i) {
                return split.slice(0, i+1).join('/');
            });
        }
    }
};
