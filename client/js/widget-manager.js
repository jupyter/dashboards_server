/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

// Adapted from example code at:
//   https://github.com/ipython/ipywidgets/blob/fc6844f8210761ff5ad1c9ffc25a70b379fc5191/examples/development/web3/src/manager.js
'use strict';

var $ = require('jquery');
var Widgets = require('jupyter-js-widgets');

    var WidgetManager = function(kernel, msgHandler) {
        //  Call the base class.
        Widgets.ManagerBase.call(this);

        this._pendingExecutions = {};
        this.kernel = kernel;
        this.msgHandler = msgHandler;

        // Create a comm manager shim
        this.commManager = new Widgets.shims.services.CommManager(kernel);

        // Register the comm target
        this.commManager.register_target(this.comm_target_name, this.handle_comm_open.bind(this));

        // Validate the version requested by the backend.
        var validate = (function validate() {
            this.validateVersion().then(function(valid) {
                if (!valid) {
                    console.warn('Widget frontend version does not match the backend.');
                }
            }).catch(function(err) {
                console.error('Could not cross validate the widget frontend and backend versions.', err);
            });
        }).bind(this);
        validate();

        this._shimWidgetsLibs();
    };

    WidgetManager.prototype = Object.create(Widgets.ManagerBase.prototype);

    //--------------------------------------------------------------------
    // Class level
    //--------------------------------------------------------------------

    WidgetManager.register_widget_model = function(model_name, model_type) {
        return Widgets.ManagerBase.register_widget_model.apply(this, arguments);
    };

    WidgetManager.register_widget_view = function(view_name, view_type) {
        return Widgets.ManagerBase.register_widget_view.apply(this, arguments);
    };


    //--------------------------------------------------------------------
    // Instance level
    //--------------------------------------------------------------------

    /*
     * Called when a jupyter widget is added to the DOM.
     *
     * msg: iopub channel, comm_msg with display data
     * view: jupyter widget view instance
     * options: object with metadata to be associated with the view
     */
    WidgetManager.prototype.display_view = function(msg, view, options) {
        var widgetInfo = this._pendingExecutions[msg.parent_header.msg_id];

        // keep tracking the message ID in case more than one widget will reside
        // in the widget area

        view.options = view.options || {};
        view.options.outputAreaModel = widgetInfo.outputAreaModel;

        return Promise.resolve(view).then(function(view) {
            // display the widget in its assigned DOM node
            widgetInfo.widgetNode.appendChild(view.el);
            view.trigger('displayed');
            view.on('remove', function() {
                console.log('view removed', view);
            });
            return view;
        });
    };

    /*
     * Returns callbacks to be invoked in response to jupyter widget-triggered
     * comm messages on shell, input, and iopub channels. Each callback takes
     * one parameter: the comm message from the kernel. The return value should
     * be an object with any of the following properties defined as functions.
     *
     * iopub.status
     * iopub.clear_output
     * iopub.output
     * shell.reply
     * input
     *
     * view: jupyter widget view instance
     */
    WidgetManager.prototype.callbacks = function(view) {
        var callbacks = {};
        if (view) {
            var options = view.options;
            // Find the output area model that manages this widget. For now,
            // we assume widgets cannot "move" across output areas and so
            // we can compute this once, not on every callback.
            while (!options.outputAreaModel && options.parent) {
                options = options.parent.options;
            }

            if (options.outputAreaModel) {
                callbacks = this._get_callbacks(options.outputAreaModel);
            } else {
                console.warn('No OutputAreaModel for widget view:', view);
            }
        }

        return callbacks;
    };

    WidgetManager.prototype._get_callbacks = function(outputAreaModel) {
        var that = this;
        return {
            iopub: {
                output: function(msg) {
                    that.msgHandler(msg, outputAreaModel);
                },
                clear_output: function(msg) {
                    that.msgHandler(msg, outputAreaModel);
                },
                status: function(msg) {
                    that.msgHandler(msg, outputAreaModel);
                }
            }
        };
    };

    /*
     * Called to create a new comm channel between frontend and backend
     * jupyter widget models. Returns a promise of a new comm channel.
     *
     * targetName: comm channel target name on the backend
     * id: jupyter widget model ID
     * metadata: ???
     */
    WidgetManager.prototype._create_comm = function(targetName, id, metadata) {
        return Promise.resolve(
            this.commManager.new_comm(targetName, {}, this.callbacks(), metadata, id)
        );
    };

    /*
     * Called to retrieve information about all existing comm channels in order
     * to initialize frontend comm channel state. Returns a promise of info
     * about all comms.
     */
    WidgetManager.prototype._get_comm_info = function() {
        return Promise.resolve({});
    };

    /*
     * Associates a spot in the DOM with an execute_request so that if the
     * execution results in the creation of a new jupyter widget, the widget
     * can be linked with its output area and place in the DOM.
     *
     * msg_id: ID of the execute_request to the kernel
     * widgetNode: DOM node where the widget should render
     * outputAreaModel: OutputArea that contains the widget
     */
    WidgetManager.prototype.trackPending = function(kernelFuture, widgetNode, outputAreaModel) {
        this._hookupWidgetsCallbacks(kernelFuture, widgetNode, outputAreaModel);

        var msg_id = kernelFuture.msg.header.msg_id;
        this._pendingExecutions[msg_id] = {
            widgetNode: widgetNode,
            outputAreaModel: outputAreaModel
        };
    };


    /**
     * SHIMS FOR WIDGET LIBRARIES
     **/

    WidgetManager.prototype._hookupWidgetsCallbacks = function(kernelFuture, widgetNode, outputAreaModel) {
        var that = this;

        kernelFuture.onReply = function(msg) {
            window.Jupyter.notebook.events.trigger('shell_reply.Kernel');
        };

        // Declarative Widgets attempts to get `callbacks` through "cell" data
        var $cell = $(widgetNode).parents('.cell');
        var cellData = $cell.data('cell') || {};
        cellData.get_callbacks = function() {
            return that._get_callbacks(outputAreaModel);
        };
        $cell.data('cell', cellData);
    };

    WidgetManager.prototype._shimWidgetsLibs = function() {
        var nb = window.Jupyter.notebook;
        nb.kernel.widget_manager = this;
        nb.kernel.comm_manager = this.commManager;

        this._shimMatplotlib();
    };

    // matplotlib shims
    WidgetManager.prototype._shimMatplotlib = function() {
        var nb = window.Jupyter.notebook;
        var cells = this._pendingExecutions;
        nb.get_cells = function() {
            return Object.keys(cells).map(function(id) {
                return {
                    cell_type: 'code', // each _pendingExecution cell is code
                    output_area: {
                        outputs: cells[id].outputAreaModel.outputs.internal
                    }
                };
            });
        };
        window.Jupyter.keyboard_manager = nb.keyboard_manager = {
            enable: function() { /* no-op */ },
            register_events: function() { /* no-op */ }
        };
        nb.set_dirty = function() { /* no-op */ };
    };

    module.exports = WidgetManager;
