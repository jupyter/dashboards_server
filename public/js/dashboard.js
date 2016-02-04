/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

requirejs.config({
    paths: {
        Gridstack: require.toUrl('/components/gridstack.min'),
        lodash: require.toUrl('/components/lodash.min'),
        jquery: require.toUrl('/components/jquery.min'),
        'jquery-ui/core': require.toUrl('/components/jquery-ui/core.min'),
        'jquery-ui/mouse': require.toUrl('/components/jquery-ui/mouse.min'),
        'jquery-ui/widget': require.toUrl('/components/jquery-ui/widget.min'),
        'jquery-ui/resizable': require.toUrl('/components/jquery-ui/resizable.min'),
        'jquery-ui/draggable': require.toUrl('/components/jquery-ui/draggable.min'),
        'jupyter-js-output-area': require.toUrl('/components/jupyter-js-output-area'),
        'jupyter-js-services': require.toUrl('/components/jupyter-js-services'),
        'jupyter-js-widgets': require.toUrl('/components/jupyter-js-widgets')
    }
});

requirejs([
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

        // show dashboard
        $container.removeClass('invisible');
    }

    // This object has delegates for kernel message handling, keyed by message
    // type. All functions here receive the entire response message and a
    // reference to an outputArea model associated with the code / widget that
    // made the initial request.
    var messageHandlers = {
        clear_output: function(msg, outputArea) {
            outputArea.clear(msg.content.wait);
        },
        stream: function(msg, outputArea) {
            var output = {};
            output.outputType = OutputType.Stream;
            output.text = msg.content.text;
            switch(msg.content.name) {
                case "stderr":
                  // show stderr in console, not in the dashboard itself
                  console.error(msg.content.name, msg.content.text);
                  break;
                case "stdout":
                  output.name = StreamName.StdOut;
                  outputArea.add(output);
                  break;
                default:
                  throw new Error('Unrecognized stream type ' + msg.content.name);
            }
        },
        display_data: function(msg, outputArea) {
            var output = {};
            output.outputType = OutputType.DisplayData;
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            outputArea.add(output);
        },
        execute_result: function(msg, outputArea) {
            var output = {};
            output.outputType = OutputType.ExecuteResult;
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            output.execution_count = msg.content.execution_count;
            outputArea.add(output);
        },
        error: function(msg, outputArea) {
            // show tracebacks in the console, not on the page
            var traceback = msg.content.traceback.join('\n');
            console.error(msg.content.ename, msg.content.evalue, traceback);
        }
    };

    // process kernel messages by delegating to handlers based on message type
    function _consumeMessage(msg, outputArea) {
        var output = {};
        var handler = messageHandlers[msg.header.msg_type];
        if(handler) {
            handler(msg, outputArea);
        } else {
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
