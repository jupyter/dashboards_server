/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
require(['main'], function() {
    require([
        'jquery',
        'gridstack-custom',
        'jupyter-js-output-area',
        'jupyter-js-widgets',
        'widget-manager',
        './kernel'
    ], function($, Gridstack, OutputArea, Widgets, WidgetManager, Kernel) {
        'use strict';

        var CONTAINER_URL = 'urth_container_url';
        var SESSION_URL = 'urth_session_url';

        var $container = $('#dashboard-container');

        function _initGrid() {
            // enable gridstack
            var gridstack = $container.gridstack({
                vertical_margin: Urth.cellMargin,
                cell_height: Urth.defaultCellHeight,
                width: Urth.maxColumns,
                static_grid: true
            }).data('gridstack');

            var halfMargin = Urth.cellMargin / 2;
            var styleRules = [
                {
                    selector: '#dashboard-container .grid-stack-item',
                    rules: 'padding: ' + halfMargin + 'px ' + (halfMargin + 6) + 'px;'
                }
            ];
            gridstack.generateStylesheet(styleRules);
        }

        // initialize Gridstack
        _initGrid();


        // start kernel
        Kernel.start().then(function(kernel) {
            var widgetManager = new WidgetManager(kernel);

            // create an output area for each dashboard code cell
            $('.dashboard-cell.code-cell').each(function() {
                var $cell = $(this);

                var widgetArea = $('<div class="widget-area">').get(0);

                var model = new OutputArea.OutputModel();
                var view = new OutputArea.OutputView(model, document);

                $cell.append(widgetArea, view.el);

                var kernelFuture = Kernel.execute($cell.index(), function(msg) {
                    if (model) {
                        model.consumeMessage(msg);
                    }
                });

                widgetManager.addWidget(widgetArea, kernelFuture.msg.header.msg_id);

                // kernelFuture.onReply = function(msg) {
                //     console.log('=> kernel reply:', msg);
                // };
            });
        });
    });
});
