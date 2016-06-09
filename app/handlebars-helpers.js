/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var commonmark = require('commonmark');
var config = require('./config');
var getObject = require('./get-object');
var urljoin = require('url-join');

var reader = new commonmark.Parser();
var writer = new commonmark.HtmlRenderer();

function getViewProps(metadata, activeView) {
    var db = getObject(metadata, 'extensions.jupyter_dashboards');
    return db && db.views[activeView];
}

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

    getActiveViewCellProps: getViewProps,

    getActiveViewProps: function(nbMetadata) {
        var db = getObject(nbMetadata, 'extensions.jupyter_dashboards');
        return db && db.views[db.activeView];
    },

    getLayoutType: function(nbMetadata, activeView) {
        var props = getViewProps(nbMetadata, activeView);
        if (!props) {
            // no dashboards metadata; just return the give active view string
            return activeView;
        }
        return props.type;
    },

    isVisible: function(metadata, activeView) {
        var props = getViewProps(metadata, activeView);
        return props && !props.hidden;
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
