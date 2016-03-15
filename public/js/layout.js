/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Module to create a dashboard layout to match the Gridstack layout from the
 * notebook dashboard authoring extension.
 */
define([
    'jquery'
], function($) {
    'use strict';

    var Config = window.jupyter_dashboard.Config;
    var cellMargin = Config.cellMargin;
    var halfMargin = cellMargin / 2;
    var cellHeight = Config.defaultCellHeight;
    var numColumns = Config.maxColumns;
    var visibleCells = $('.dashboard-cell:not(.hidden)');
    var maxY = visibleCells.map(function(i, cell) {
            return $(cell).attr('data-y');
        }).get().reduce(function(a, b) {
            return Math.max(a, b);
        }, 0);
    var maxHeight = visibleCells.map(function(i, cell) {
            return $(cell).attr('data-height');
        }).get().reduce(function(a, b) {
            return Math.max(a, b);
        }, 0);
    var height = maxY * cellHeight + (maxY - 1) * cellMargin + maxHeight;

    function _createStyle() {
        $('#dashboard-layout').remove();
        var style = $('<style>')
            .attr('id', 'dashboard-layout')
            .attr('type', 'text/css');
        $('head').append(style);
        var sheet = style.get(0).sheet;

        // x-position
        var left;
        for (var x = 0; x < numColumns; x++) {
            left = (x / numColumns * 100) + '%';
            sheet.insertRule('.dashboard-cell[data-x="' + x + '"] { left: ' + left + ' }', 0);
        }

        // y-position
        var top;
        for (var y = 0; y <= maxY; y++) {
            top = y * cellHeight + y * cellMargin + 'px';
            sheet.insertRule('.dashboard-cell[data-y="' + y + '"] { top: ' + top + ' }', 0);
        }

        // width
        var width;
        for (var w = 1; w <= numColumns; w++) {
            width = (w / numColumns * 100) + '%';
            sheet.insertRule('.dashboard-cell[data-width="' + w + '"] { width: ' + width + ' }', 0);
        }

        // height
        var height;
        for (var h = 1; h <= maxHeight; h++) {
            height = h * cellHeight + (h-1) * cellMargin + 'px';
            sheet.insertRule('.dashboard-cell[data-height="' + h + '"] { height: ' + height + '}', 0);
        }

        // cell padding
        sheet.insertRule('.dashboard-cell { padding: ' +
            halfMargin + 'px ' + (halfMargin + 6) + 'px }', 0);
    }

    return {
        createStyle: _createStyle
    };
});
