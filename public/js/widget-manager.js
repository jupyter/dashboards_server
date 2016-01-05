/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

// Adapted from example code at:
//   https://github.com/ipython/ipywidgets/blob/fc6844f8210761ff5ad1c9ffc25a70b379fc5191/examples/development/web3/src/manager.js
define(['jupyter-js-widgets'], function(Widgets) {

    var WidgetManager  = function(kernel, el) {
        //  Call the base class.
        Widgets.ManagerBase.call(this);

        this.kernel = kernel;
        this.el = el;

        // Create a comm manager shim
        this.commManager = new Widgets.shims.services.CommManager(kernel);

        // Register the comm target
        this.commManager.register_target(this.comm_target_name, this.handle_comm_open.bind(this));
    };
    WidgetManager.prototype = Object.create(Widgets.ManagerBase.prototype);

    WidgetManager.prototype.display_view = function(msg, view, options) {
        var that = this;
        return Promise.resolve(view).then(function(view) {
            that.el.appendChild(view.el);
            view.on('remove', function() {
                console.log('view removed', view);
            });
            return view;
        });
    };

    WidgetManager.prototype._create_comm = function(targetName, id, metadata) {
        return this.commManager.new_comm(targetName, metadata, id);
    };

    WidgetManager.prototype._get_comm_info = function() {
        return Promise.resolve({});
    };

    return WidgetManager;
});
