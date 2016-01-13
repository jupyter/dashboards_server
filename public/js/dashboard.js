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

        var OutputType = OutputArea.OutputType;
        var OutputAreaModel = OutputArea.OutputAreaModel;
        var OutputAreaWidget = OutputArea.OutputAreaWidget;
        var StreamName = OutputArea.StreamName;

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

        function _consumeMessage(msg, outputArea) {
            var output = {};
            var content = msg.content;
            switch (msg.header.msg_type) {
                case 'clear_output':
                  outputArea.clear(content.wait);
                  break;
                case 'stream':
                  output.outputType = OutputType.Stream;
                  output.text = content.text;
                  switch(content.name) {
                      case "stderr":
                        output.name = StreamName.StdErr;
                        break;
                      case "stdout":
                        output.name = StreamName.StdOut;
                        break;
                      default:
                        throw new Error('Unrecognized stream type ' + content.name);
                  }
                  outputArea.add(output);
                  break;
                case 'display_data':
                  output.outputType = OutputType.DisplayData;
                  output.data = content.data;
                  output.metadata = content.metadata;
                  outputArea.add(output);
                  break;
                case 'execute_result':
                  output.outputType = OutputType.ExecuteResult;
                  output.data = content.data;
                  output.metadata = content.metadata;
                  output.execution_count = content.execution_count;
                  outputArea.add(output);
                  break;
                case 'error':
                  output.outputType = OutputType.Error;
                  output.ename = content.ename;
                  output.evalue = content.evalue;
                  output.traceback = content.traceback.join('\n');
                  outputArea.add(output);
                  break;
                default:
                  console.error('Unhandled message', msg);
            }
        }

        // initialize Gridstack
        _initGrid();


        // start kernel
        Kernel.start().then(function(kernel) {
            var widgetManager = new WidgetManager(kernel);

            // create an output area for each dashboard code cell
            $('.dashboard-cell.code-cell').each(function() {
                var $cell = $(this);

                var model = new OutputAreaModel();
                var view = new OutputAreaWidget(model);
                view.attach(this);

                var widgetArea = $('<div class="widget-area">').get(0);
                $cell.append(widgetArea, view.node);

                var kernelFuture = Kernel.execute($cell.index(), function(msg) {
                    if (model) {
                        _consumeMessage(msg, model);
                    }
                });

                widgetManager.addWidget(widgetArea, kernelFuture.msg.header.msg_id);
            });
        });
    });
});
