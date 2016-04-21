/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var commonmark = require('commonmark');
var config = require('./config');
var urljoin = require('url-join');

var reader = new commonmark.Parser();
var writer = new commonmark.HtmlRenderer();

module.exports = {
    config: function(name) {
        return config.get(name);
    },

    defaultDashboardConfig: function(layout) {
        if (layout === 'grid') {
            return {
                layout: 'grid',
                cellMargin: config.get('DB_CELL_MARGIN'),
                defaultCellHeight: config.get('DB_DEFAULT_CELL_HEIGHT'),
                maxColumns: config.get('DB_MAX_COLUMNS')
            };
        } else {
            return {};
        }
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

    isVisible: function(metadata) {
        return metadata &&
               metadata.urth &&
               metadata.urth.dashboard &&
               !metadata.urth.dashboard.hidden;
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

    urlJoin: function() {
        // need varargs but Handlebars adds an arg to the end, so slice it off
        var args = Array.apply(null, arguments).slice(0, arguments.length-1);
        return urljoin.apply(null, args);
    },

    basename: function(url) {
        if (!url) {
            return [];
        } else {
            return url.split('/')
                .filter(function(str) {
                    return !!str; // ignore empty strings
                })
                .map(function(d, i, arr) {
                    return arr.slice(0, i+1).join('/');
                });
        }
    }
};
