require(['main'], function() {
    require([
        'jquery',
        'gridstack-custom',
        'jupyter-js-output-area',
        './kernel'
    ], function($, Gridstack, OutputArea, Kernel) {
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
        Kernel.start().then(function() {
            // create an output area for each dashboard code cell
            $('.dashboard-cell.code-cell').each(function() {
                var $cell = $(this);

                var model = new OutputArea.OutputModel();
                var view = new OutputArea.OutputView(model, document);
                $cell.append(view.el);

                Kernel.execute($cell.index(), function(msg) {
                    if (model) {
                        model.consumeMessage(msg);
                    }
                });
            });
        });
    });
});
