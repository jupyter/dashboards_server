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
    }
};
