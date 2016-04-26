/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var $ = require('jquery');

    var $errorContainer = $('.error-container');

    function _show() { $errorContainer.removeClass('invisible'); }
    function _hide() { $errorContainer.addClass('invisible'); }
    $errorContainer.find('.error-indicator').click(_hide);

    module.exports = {
        show: _show,
        hide: _hide
    };
