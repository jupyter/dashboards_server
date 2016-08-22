/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

'use strict';

var $ = require('jquery');
var AnsiParser = require('ansi-parser');
var defaultSanitizer = require('jupyterlab/lib/sanitizer').defaultSanitizer;
var OutputArea = require('jupyterlab/lib/notebook/output-area');
var RenderMime = require('jupyterlab/lib/rendermime').RenderMime;
var renderers = require('jupyterlab/lib/renderers');
var Services = require('jupyter-js-services');
var PhWidget = require('phosphor-widget');

var Widgets = require('jupyter-js-widgets');
require('jquery-ui/themes/smoothness/jquery-ui.min.css');
require("jupyter-js-widgets/css/widgets.min.css");

var WidgetManager = require('./widget-manager');
var ErrorIndicator = require('./error-indicator');
var Kernel = require('./kernel');
var Layout = require('./layout');

// ES6 Promise polyfill
require('es6-promise').polyfill();

// Element.prototype.matches polyfill -- fixes widgets rendering issue in IE 11
// See ipywidgets' embed-webpack.js
if (Element && !Element.prototype.matches) {
    var proto = Element.prototype;
    proto.matches = proto.matchesSelector ||
    proto.mozMatchesSelector || proto.msMatchesSelector ||
    proto.oMatchesSelector || proto.webkitMatchesSelector;
}

    var OutputAreaModel = OutputArea.OutputAreaModel;
    var OutputAreaWidget = OutputArea.OutputAreaWidget;
    var Config = window.jupyter_dashboard.Config;

    var $container = $('#dashboard-container');

    // render the dashboard dom layout
    _renderDashboard();

    // setup shims for backwards compatibility
    _shimNotebook();

    // setup renderer chain for output mimetypes
    var renderMime = _createRenderMime();

    // start a kernel
    Kernel.start(Config.kernelname).then(function(kernel) {
        // do some additional shimming
        _setKernelShims(kernel);

        // initialize a watcher for kernel errors to inform the user
        _registerKernelErrorHandler(kernel);

        // initialize an ipywidgets manager
        var widgetManager = new WidgetManager(kernel, _consumeMessage);

        // initialize Declarative Widgets library
        var widgetsReady = _initDeclWidgets();

        // ensure client-side widgets are ready before executing code
        return widgetsReady.then(function() {
            // setup and execute code cells
            _getCodeCells().each(function() {
                var $cell = $(this);

                var view = new OutputAreaWidget({ rendermime: renderMime });
                var model = new OutputAreaModel();
                view.model = model;
                view.trusted = true; // always trust notebooks

                model.changed.connect(function(sender, args) {
                    // add rendered_html class on the view to match what notebook does
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
    }).catch(function(err) {
        console.error(err);
        ErrorIndicator.show();
    });

    // shim Jupyter Notebook objects for backwards compatibility
    function _shimNotebook() {
        var jup = window.Jupyter = window.Jupyter || {};
        window.IPython = window.Jupyter;
        var nb = jup.notebook = jup.notebook || {};
        nb.base_url = document.baseURI;
        nb.events = nb.events || $({});

        // setup module paths used by plugins
        window.require.config({
            map: {
                '*': {
                    'nbextensions/widgets/widgets/js/widget': 'jupyter-js-widgets',
                    'jupyter-decl-widgets': 'urth_widgets/js/widgets'
                }
            }
        });

        // define require.js modules; needed by some plugins/libraries
        window.define('jquery', function() {
            return $;
        });
        window.define('jupyter-js-widgets', function() {
            return Widgets;
        });
    }

    // create a rendermime instance with all the standard mimetype
    // transformers used in notebooks
    function _createRenderMime() {
        var transformers = [
            new renderers.JavascriptRenderer(),
            new renderers.MarkdownRenderer(),
            // new renderers.HTMLRenderer(),
            // NOTE: The HTMLRenderer doesn't work with current Safari versions -- inline JS scripts
            // don't load. This simple implementation works around it by using jQuery to add the
            // HTML to the DOM; this does run inline scripts.
            (function() {
                var r = new renderers.HTMLRenderer();
                r.render = function(options) {
                    var source = options.source;
                    if (options.sanitizer) {
                        source = options.sanitizer.sanitize(source);
                    }
                    var widget = new PhWidget.Widget();
                    widget.onAfterAttach = function() {
                        $(widget.node).html(source);
                        if (options.resolver) {
                            renderers.resolveUrls(widget.node, options.resolver);
                        }
                    };
                    return widget;
                };
                return r;
            })(),
            new renderers.ImageRenderer(),
            new renderers.SVGRenderer(),
            new renderers.LatexRenderer(),
            new renderers.TextRenderer()
        ];
        var mimeMap = {};
        var order = [];
        transformers.forEach(function(t) {
            t.mimetypes.forEach(function(m) {
                order.push(m);
                mimeMap[m] = t;
            });
        });
        return new RenderMime({
            renderers: mimeMap,
            order: order,
            sanitizer: defaultSanitizer
        });
    }

    // shim kernel object on notebook for backward compatibility
    function _setKernelShims(kernel) {
        var nb = window.Jupyter.notebook;
        nb.kernel = kernel;

        kernel.is_connected = function() {
            return kernel.status === 'busy' || kernel.status === 'idle';
        };

        // if the kernel is not already started and idle, wait for it to be
        if (kernel.status !== 'idle') {
            var puller = function(kernel, status) {
                if (status === 'idle') {
                    kernel.statusChanged.disconnect(puller);
                    nb.events.trigger('kernel_ready.Kernel');
                }
            };
            kernel.statusChanged.connect(puller);
        } else {
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
        return new Promise(function(resolve, reject) {
            if (Config.supportsDeclWidgets) {
                // construct path relative to notebook, in order to properly configure require.js
                var a = document.createElement('a');
                a.href = document.baseURI;
                var path = a.pathname;
                var sep = path[path.length-1] === '/' ? '' : '/';
                window.require.config({
                    paths: {
                        'nbextensions/urth_widgets': path + sep + 'urth_widgets'
                    }
                });

                window.require(['nbextensions/urth_widgets/js/init/init'], function(declWidgetsInit) {
                    // initialize Declarative Widgets
                    var res = declWidgetsInit({
                        namespace: window.Jupyter,
                        events: window.Jupyter.notebook.events,
                        suppressErrors: true,               // hide all errors in  dashboard view
                        WidgetManager: WidgetManager,       // backwards compatibility (<= 0.4)
                        WidgetModel: Widgets.WidgetModel    // backwards compatibility (<= 0.4)
                    });

                    if (res.whenReady) {
                        res.whenReady(resolve);
                    } else if (res.then) {
                        // backwards compatible (<= 0.5) -- older versions returned a Promise
                        res.then(resolve, reject);
                    }
                });
            } else {
                console.log('Declarative Widgets not supported ("urth_components" directory not found)');
                resolve();
            }
        });
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
            output.output_type = 'stream';
            output.text = msg.content.text;
            switch(msg.content.name) {
                case "stderr":
                  // show stderr in console, not in the dashboard itself
                  console.error(msg.content.name, msg.content.text);
                  break;
                case "stdout":
                  output.name = 'stdout';
                  outputAreaModel.add(output);
                  break;
                default:
                  throw new Error('Unrecognized stream type ' + msg.content.name);
            }
        },
        display_data: function(msg, outputAreaModel) {
            var output = {};
            output.output_type = 'display_data';
            output.data = msg.content.data;
            output.metadata = msg.content.metadata;
            outputAreaModel.add(output);
        },
        execute_result: function(msg, outputAreaModel) {
            var output = {};
            output.output_type = 'execute_result';
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
        var handler = messageHandlers[msg.header.msg_type];
        if (handler) {
            handler(msg, outputAreaModel);
        } else {
            console.warn('Unhandled message', msg);
        }
    }

    // show the user an indicator on error
    function _registerKernelErrorHandler(kernel) {
        kernel.statusChanged.connect(function(kernel, status) {
            if (status === 'dead' ||
                status === 'reconnecting') {
                ErrorIndicator.show();
            }
        });
    }

    function _renderDashboard() {
        if (Config.layout.type === 'grid') {
            Layout.createStyle();
        }
        $container.removeClass('invisible');
    }

    function _getCodeCells() {
        return $('.dashboard-cell.code-cell').sort(function(a, b) {
            return $(a).attr('data-cell-index') - $(b).attr('data-cell-index');
        });
    }
