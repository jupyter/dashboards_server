/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

requirejs.config({
    paths: {
        bootstrap: require.toUrl('/components/bootstrap.min'),
        Gridstack: require.toUrl('/components/gridstack.min'),
        jquery: require.toUrl('/components/jquery.min'),
        'jquery-ui': require.toUrl('/components/jquery-ui.min'),
        'jupyter-js-output-area': require.toUrl('/components/jupyter-js-output-area'),
        'jupyter-js-services': require.toUrl('/components/jupyter-js-services'),
        'jupyter-js-widgets': require.toUrl('/components/jupyter-js-widgets'),
        lodash: require.toUrl('/components/lodash.min')
    },
    map: {
        Gridstack: {
            'jquery-ui/core': 'jquery-ui',
            'jquery-ui/mouse': 'jquery-ui',
            'jquery-ui/widget': 'jquery-ui',
            'jquery-ui/resizable': 'jquery-ui',
            'jquery-ui/draggable': 'jquery-ui'
        }
    },
    shim : {
        bootstrap: {
            deps: [ 'jquery' ]
        }
    }
});

requirejs([
    'jquery',
    './gridstack-custom',
    'jupyter-js-output-area',
    'jupyter-js-services',
    'bootstrap',  // required by jupyter-js-widgets
    'jupyter-js-widgets',
    './widget-manager',
    './error-indicator',
    './kernel'
], function(
    $,
    Gridstack,
    OutputArea,
    Services,
    bs,
    Widgets,
    WidgetManager,
    ErrorIndicator,
    Kernel
) {
    'use strict';

    var OutputType = OutputArea.OutputType;
    var OutputAreaModel = OutputArea.OutputAreaModel;
    var OutputAreaWidget = OutputArea.OutputAreaWidget;
    var StreamName = OutputArea.StreamName;
    var Config = window.jupyter_dashboard.Config;

    var $container = $('#dashboard-container');

    // initialize Gridstack
    _initGrid();

    _initDeclWidgets();

    // start a kernel
    Kernel.start().then(function(kernel) {
        // initialize an ipywidgets manager
        var widgetManager = new WidgetManager(kernel, _consumeMessage);
        _registerKernelErrorHandler(kernel);

        _getCodeCells().each(function() {
            var $cell = $(this);

            // create a jupyter output area mode and widget view for each
            // dashboard code cell
            var model = new OutputAreaModel();
            var view = new OutputAreaWidget(model);
            model.outputs.changed.connect(function(sender, args) {
                if (args.newValue.data &&
                    args.newValue.data.hasOwnProperty('text/html')) {
                    view.addClass('rendered_html');
                }
            });

            // attach the view to the cell dom node
            view.attach(this);

            // create the widget area and widget subarea dom structure used
            // by ipywidgets in jupyter
            var $widgetArea = $('<div class="widget-area">');
            var $widgetSubArea = $('<div class="widget-subarea">').appendTo($widgetArea);
            // append the widget area and the output area within the grid cell
            $cell.append($widgetArea, view.node);

            // request execution of the code associated with the dashboard cell
            var kernelFuture = Kernel.execute($cell.attr('data-cell-index'), function(msg) {
                // handle the response to the initial execution request
                if (model) {
                    _consumeMessage(msg, model);
                }
            });
            // track execution replies in order to associate the newly created
            // widget *subarea* with its output areas and DOM container
            widgetManager.trackPending(kernelFuture, $widgetSubArea.get(0), model);
        });
    });


    function _initGrid() {
        // enable gridstack with parameters set by JS in the HTML page by
        // the backend
        var gridstack = $container.gridstack({
            vertical_margin: Config.cellMargin,
            cell_height: Config.defaultCellHeight,
            width: Config.maxColumns,
            static_grid: true
        }).data('gridstack');

        var halfMargin = Config.cellMargin / 2;
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

    function _initDeclWidgets() {
        if (Config.supportsDeclWidgets) {
            // construct path relative to notebook, in order to properly configure require.js
            var a = document.createElement('a');
            a.href = document.baseURI;
            var path = a.pathname;
            var sep = path[path.length-1] === '/' ? '' : '/';
            require.config({
                paths: {
                    'urth_widgets': a.protocol + '//' + a.host + path + sep + 'urth_widgets'
                }
            });

            require(['urth_widgets/js/init/init'], function(DeclWidgets) {
                // initialize Declarative Widgets
                // NOTE: DeclWidgets adds 'urth_components/...' to this path
                DeclWidgets(document.baseURI);
            });
        } else {
            console.log('Declarative Widgets not supported ("urth_components" directory not found)');
        }
    }

    // This object has delegates for kernel message handling, keyed by message
    // type. All functions here receive the entire response message and a
    // reference to an OutputAreaModel associated with the code / widget that
    // made the initial request.
    var messageHandlers = {
        clear_output: function(msg, outputAreaModel) {
            outputAreaModel.clear(msg.content.wait);
        },
        stream: function(msg, outputAreaModel) {
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
                  outputAreaModel.add(output);
                  break;
                default:
                  throw new Error('Unrecognized stream type ' + msg.content.name);
            }
        },
        display_data: function(msg, outputAreaModel) {
            var output = {};
            output.outputType = OutputType.DisplayData;
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            outputAreaModel.add(output);
        },
        execute_result: function(msg, outputAreaModel) {
            var output = {};
            output.outputType = OutputType.ExecuteResult;
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            output.execution_count = msg.content.execution_count;
            outputAreaModel.add(output);
        },
        error: function(msg, outputAreaModel) {
            // show tracebacks in the console, not on the page
            var traceback = msg.content.traceback.join('\n');
            console.error(msg.content.ename, msg.content.evalue, traceback);
            ErrorIndicator.show();
        },
        status: function(msg, outputAreaModel) {
            // pass for now
        },
        comm_msg: function(msg, outputAreaModel) {
            // pass, let widgets deal with it
        }
    };

    // process kernel messages by delegating to handlers based on message type
    function _consumeMessage(msg, outputAreaModel) {
        var output = {};
        var handler = messageHandlers[msg.header.msg_type];
        if(handler) {
            handler(msg, outputAreaModel);
        } else {
            console.warn('Unhandled message', msg);
        }
    }

    function _registerKernelErrorHandler(kernel) {
        kernel.statusChanged.connect(function(kernel, status) {
            if (status === Services.KernelStatus.Dead ||
                status === Services.KernelStatus.Reconnecting) {
                ErrorIndicator.show();
            }
        });
    }

    function _getCodeCells() {
        return $('.dashboard-cell.code-cell').sort(function(a, b) {
            return $(a).attr('data-cell-index') - $(b).attr('data-cell-index');
        });
    }
});
