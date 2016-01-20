/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

// Adapted from example code at:
//   https://github.com/ipython/ipywidgets/blob/fc6844f8210761ff5ad1c9ffc25a70b379fc5191/examples/development/web3/src/manager.js
define(['jupyter-js-widgets'], function(Widgets) {

    var WidgetManager  = function(kernel) {
        //  Call the base class.
        Widgets.ManagerBase.call(this);

        this._msg_cells = {};
        this.kernel = kernel;

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
    };
    WidgetManager.prototype = Object.create(Widgets.ManagerBase.prototype);

    WidgetManager.prototype.display_view = function(msg, view, options) {
        var widgetArea = this._msg_cells[msg.parent_header.msg_id];
        return Promise.resolve(view).then(function(view) {
            widgetArea.appendChild(view.el);
            view.on('remove', function() {
                console.log('view removed', view);
            });
            return view;
        });
    };

    WidgetManager.prototype._create_comm = function(targetName, id, metadata) {
        return Promise.resolve(this.commManager.new_comm(targetName, metadata, id));
    };

    WidgetManager.prototype._get_comm_info = function() {
        return Promise.resolve({});
    };

    WidgetManager.prototype.addWidget = function(widgetArea, msg_id) {
        this._msg_cells[msg_id] = widgetArea;
    };

    return WidgetManager;
});
