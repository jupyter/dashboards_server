/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

'use strict';

var $ = require('jquery');
var Services = require('jupyter-js-services');

    var _outputAreaHandledMsgs = {
        'clear_output': 1,
        'stream': 1,
        'display_data': 1,
        'execute_result': 1,
        'error': 1
    };

    var _kernel;

    function showBusyIndicator(isBusy) {
        $('.busy-indicator')
            .toggleClass('show', isBusy)
            // Prevent progress animation when hidden by removing 'active' class.
            .find('.progress-bar')
                .toggleClass('active', isBusy);
    }

    function _startKernel(kernelname) {
        var loc = window.location;
        var kernelUrl = loc.protocol + '//' + loc.host;
        var clientId = _uuid();
        var kernelOptions = {
            baseUrl: kernelUrl,
            wsUrl: kernelUrl.replace(/^http/, 'ws'),
            name: kernelname,
            clientId: clientId,
            ajaxSettings: {
                requestHeaders: {
                    'X-jupyter-notebook-path': decodeURIComponent(loc.pathname),
                    'X-jupyter-session-id': clientId
                }
            }
        };

        // Show busy while a kernel is starting since some kernels take time
        showBusyIndicator(true);

        return Services.startNewKernel(kernelOptions).then(function(kernel) {
                _kernel = kernel;

                // show a busy indicator when communicating with kernel
                var debounced;
                kernel.statusChanged.connect(function(_kernel, status) {
                    clearTimeout(debounced);
                    debounced = setTimeout(function() {
                        var isBusy = status === 'busy';
                        showBusyIndicator(isBusy);
                    }, 500);
                });
                return kernel;
            })
            .catch(function(e) {
                showBusyIndicator(false);
                throw new Error('Failed to create kernel');
            });
    }

    /**
     * Get a random 128b hex string (not a formal UUID)
     * (from jupyter-js-services/utils.js)
     */
    function _uuid() {
        var s = [];
        var hexDigits = "0123456789abcdef";
        var nChars = hexDigits.length;
        for (var i = 0; i < 32; i++) {
            s[i] = hexDigits.charAt(Math.floor(Math.random() * nChars));
        }
        return s.join("");
    }

    function _execute(cellIndex, resultHandler) {
        var future = _kernel.execute({
            code: cellIndex + '',
            silent: false,
            stop_on_error: true,
            allow_stdin: false
        });
        future.onIOPub = function(msg) {
            if (msg.msg_type in _outputAreaHandledMsgs) {
                resultHandler(msg);
            }
        };
        return future;
        // TODO error handling
    }

    module.exports = {
        start: _startKernel,
        execute: _execute
    };
