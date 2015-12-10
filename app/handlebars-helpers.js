commonmark = require('commonmark');

var reader = new commonmark.Parser();
var writer = new commonmark.HtmlRenderer();

module.exports = {
    mapCellType: function(cellType) {
        return cellType === 'markdown' ? 'text-cell' : 'code-cell';
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
