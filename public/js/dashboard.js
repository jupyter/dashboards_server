/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

requirejs.config({
    paths: {
        bootstrap: require.toUrl('/components/bootstrap.min'),
        jquery: require.toUrl('/components/jquery.min'),
        'jquery-ui': require.toUrl('/components/jquery-ui/jquery-ui'),
        'jupyter-js-output-area': require.toUrl('/components/jupyter-js-output-area'),
        'jupyter-js-services': require.toUrl('/components/jupyter-js-services'),
        'jupyter-js-widgets': require.toUrl('/components/jupyter-js-widgets'),
        lodash: require.toUrl('/components/lodash.min'),
        'ansi-parser': require.toUrl('/components/ansi-parser')
    },
    shim : {
        bootstrap: {
            deps: [ 'jquery' ]
        }
    }
});

requirejs([
    'jquery',
    'jupyter-js-output-area',
    'jupyter-js-services',
    'bootstrap',  // required by jupyter-js-widgets
    'jupyter-js-widgets',
    './widget-manager',
    './error-indicator',
    './kernel',
    './layout',
    'ansi-parser'
], function(
    $,
    OutputArea,
    Services,
    bs,
    Widgets,
    WidgetManager,
    ErrorIndicator,
    Kernel,
    Layout,
    AnsiParser
) {
    'use strict';

    var OutputAreaModel = OutputArea.OutputAreaModel;
    var OutputAreaWidget = OutputArea.OutputAreaWidget;
    var Config = window.jupyter_dashboard.Config;

    var $container = $('#dashboard-container');

    _renderDashboard();

    // setup shims for backwards compatibility
    _shimNotebook();

    // start a kernel
    Kernel.start().then(function(kernel) {
        // do some additional shimming
        _setKernelShims(kernel);

        _registerKernelErrorHandler(kernel);

        // initialize an ipywidgets manager
        var widgetManager = new WidgetManager(kernel, _consumeMessage);

        // initialize Declarative Widgets library
        var widgetsReady = _initDeclWidgets();

        // ensure client-side widgets are ready before executing code
        widgetsReady.then(function() {
            // setup and execute code cells
            _getCodeCells().each(function() {
                var $cell = $(this);

                var model = new OutputAreaModel();
                model.trusted = true; // always trust notebooks
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
    }, function(err) {
        console.error('Failed to start kernel:', err);
    });

    // shim Jupyter Notebook objects for backwards compatibility
    function _shimNotebook() {
        var jup = window.Jupyter = window.Jupyter || {};
        window.IPython = window.Jupyter;
        var nb = jup.notebook = jup.notebook || {};
        nb.base_url = document.baseURI;
        nb.events = nb.events || $({});

        // setup module paths used by plugins
        require.config({
            map: {
                '*': {
                    'nbextensions/widgets/widgets/js/widget': 'jupyter-js-widgets'
                }
            }
        });
    }

    function _setKernelShims(kernel) {
        var nb = window.Jupyter.notebook;
        nb.kernel = kernel;
        var KernelStatus = Services.KernelStatus;
        nb.kernel.is_connected = function() {
            return kernel.status === KernelStatus.Busy || kernel.status === KernelStatus.Idle;
        };

        // if the kernel is not already started and idle, wait for it to be
        if (kernel.status !== KernelStatus.Idle) {
            var puller = function(kernel, status) {
                if (status === Services.KernelStatus.Idle) {
                    nb.kernel.statusChanged.disconnect(puller);
                    nb.events.trigger('kernel_ready.Kernel');
                }
            }
            nb.kernel.statusChanged.connect(puller);
        }
        else {
            // kernel has already started
            nb.events.trigger('kernel_ready.Kernel');
        }
    }

    /**
     * Initialize Declarative Widgets library. Requires that a widget manager has been created.
     * @return {Promise} resolved when (1) Declarative Widgets have fully initialized; or
     *                   (2) Declarative Widgets are not supported on this page
     */
    function _initDeclWidgets() {
        var deferred = new $.Deferred();

        if (Config.supportsDeclWidgets) {
            // construct path relative to notebook, in order to properly configure require.js
            var a = document.createElement('a');
            a.href = document.baseURI;
            var path = a.pathname;
            var sep = path[path.length-1] === '/' ? '' : '/';
            require.config({
                paths: {
                    'nbextensions/urth_widgets': path + sep + 'urth_widgets'
                }
            });

            require(['nbextensions/urth_widgets/js/init/init'], function(declWidgetsInit) {
                // initialize Declarative Widgets
                declWidgetsInit({
                        namespace: window.Jupyter,
                        events: window.Jupyter.notebook.events,
                        WidgetManager: WidgetManager,       // backwards compatibility
                        WidgetModel: Widgets.WidgetModel    // backwards compatibility
                    })
                    .then(deferred.resolve);
            });
        } else {
            console.log('Declarative Widgets not supported ("urth_components" directory not found)');
            deferred.resolve();
        }

        return deferred;
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
            output.output_type = "stream";
            output.text = msg.content.text;
            switch(msg.content.name) {
                case "stderr":
                  // show stderr in console, not in the dashboard itself
                  console.error(msg.content.name, msg.content.text);
                  break;
                case "stdout":
                  output.name = "stdout";
                  outputAreaModel.add(output);
                  break;
                default:
                  throw new Error('Unrecognized stream type ' + msg.content.name);
            }
        },
        display_data: function(msg, outputAreaModel) {
            var output = {};
            output.output_type = "display_data";
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            outputAreaModel.add(output);
        },
        execute_result: function(msg, outputAreaModel) {
            var output = {};
            output.output_type = "execute_result";
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            output.execution_count = msg.content.execution_count;
            outputAreaModel.add(output);
        },
        error: function(msg, outputAreaModel) {
            // show tracebacks in the console, not on the page
            var traceback = AnsiParser.removeAnsi(msg.content.traceback.join('\n'));
            console.error(msg.content.ename, ':', msg.content.evalue, '\n', traceback);
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

    function _renderDashboard() {
        Layout.createStyle();
        $container.removeClass('invisible');
    }

    function _getCodeCells() {
        return $('.dashboard-cell.code-cell').sort(function(a, b) {
            return $(a).attr('data-cell-index') - $(b).attr('data-cell-index');
        });
    }
});
