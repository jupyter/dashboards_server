/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var httpProxy = require('http-proxy');
var debug = require('debug')('dashboard-proxy:server');
var wsutils = require('../app/ws-utils');
var nbstore = require('../app/notebook-store');
var config = require('../app/config');
var Promise = require('es6-promise').Promise;
var request = require('request');
var url = require('url');
var urljoin = require('url-join');

var kgUrl = config.get('KERNEL_GATEWAY_URL');
var kgAuthToken = config.get('KG_AUTH_TOKEN');
var kgBaseUrl = config.get('KG_BASE_URL');

var server = null;
var sessions = {};
var apiRe = new RegExp('^/api(/.*$)');
var kernelIdRe = new RegExp('^.*/kernels/([^/]*)');

var proxy = httpProxy.createProxyServer({
        target: urljoin(kgUrl, kgBaseUrl, '/api'),
        changeOrigin: true,
        hostRewrite: true,
        autoRewrite: true,
        protocolRewrite: true
    });

var substituteCodeCell = function(d) {
    debug('PROXY: received message from client WS: ' + (d && d.payload));
    var transformedData = d;

    // substitute in code if necessary
    // for performance reasons, first do a quick string check before JSON parsing
    if (d && d.payload.indexOf('execute_request') !== -1) {
        try {
            d.payload = JSON.parse(d.payload);
            if (d.payload.header.msg_type === 'execute_request') {
                // get notebook data for current session
                var nbpath = sessions[d.payload.header.session];
                transformedData = nbstore.get(nbpath).then(
                  function success(nb) {
                        // get code string for cell at index and update WS message

                        // code must be an integer corresponding to a cell index
                        var cellIdx = parseInt(d.payload.content.code, 10);

                        // code must only consist of a non-negative integer
                        if (cellIdx.toString(10) === d.payload.content.code &&
                                cellIdx >= 0) {

                            // substitute cell's actual code into the message
                            var code = nb.cells[cellIdx].source.join('');
                            d.payload.content.code = code;
                            d.payload = JSON.stringify(d.payload);
                        } else {
                            // throw away execute request that has non-integer code
                            d = null;
                        }
                        return d;
                    },
                    function error() {
                        return d; // data remains unchanged
                    });
            }
        } catch(e) {
            // TODO better handle parse error in WS message
            console.error('Failed to parse `data` in WS. Leaving unchanged.', e);
        }
    }
    return transformedData;
};

function setupWSProxy(_server) {
    debug('setting up WebSocket proxy');
    server = _server;

    // Listen to the `upgrade` event and proxy the WebSocket requests as well.
    _server.on('upgrade', function(req, socket, head) {
        var _emit = socket.emit;
        socket.emit = function(eventName, data) {

            // Handle TCP data
            if (eventName === 'data') {
                var codeCellsSubstituted = data;
                // Decode one or more websocket frames
                var decodedData = wsutils.decodeWebSocket(data);

                if(!decodedData.length) {
                    // HACK / TODO: Pass through anything that comes in by
                    // itself that we don't know how to decode as text data.
                    // This quickfix does not handle cases where multiple
                    // messages are in the buffer, and some are text data
                    // while others are not.
                    _emit.call(socket, eventName, data);
                    return;
                }

                // decodedData is an array of multiple messages
                codeCellsSubstituted = decodedData.map(substituteCodeCell);

                Promise.all(codeCellsSubstituted).then(function(data) {
                    // data is an array of messages
                    // filter out null messages (if any)
                    data = data.filter(function(d) {
                        return !!d;
                    });
                    // re-encode
                    data = wsutils.encodeWebSocket(data);
                    _emit.call(socket, eventName, data);
                });
            } else {
              _emit.call(socket, eventName, data);
            }
        };

        // Add handler for reaping a kernel and removing sessions if the client
        // socket closes.
        //
        // Assumes kernel ID and session ID are part of request url as follows:
        //
        // /api/kernels/8c51e1d7-7a1c-4ceb-a7dd-3a567f1505b9/channels?session_id=448e417f4c9a582bcaed2905541dcff0
        var kernelIdMatched = kernelIdRe.exec(req.url);
        var query = url.parse(req.url, true).query;
        var sessionId = query['session_id'];
        socket.on('close', function() {
            removeSession(sessionId);
            if (kernelIdMatched) {
                var kernelId = kernelIdMatched[1];
                debug('PROXY: WS closed for ' + kernelId);
                killKernel(kernelId);
            }
        });

        // remove '/api', otherwise proxies to '/api/api/...'
        req.url = apiRe.exec(req.url)[1];
        proxy.ws(req, socket, head);
    });
}

// Kill kernel on backend kernel gateway.
var killKernel = function(kernelId) {
    debug('PROXY: killing kernel ' + kernelId);
    var endpoint = urljoin(kgUrl, kgBaseUrl, '/api/kernels/', kernelId);
    var headers = {};
    if (kgAuthToken) {
        headers['Authorization'] = 'token ' + kgAuthToken;
    }
    request({
        url: endpoint,
        method: 'DELETE',
        headers: headers
    }, function(error, response, body) {
        debug('PROXY: kill kernel response: ' +
            response.statusCode + ' ' + response.statusMessage);
    });
};

// Cleanup session
var removeSession = function(sessionId) {
    debug('PROXY: Removing session ' + sessionId);
    return delete sessions[sessionId];
};

var proxyRoute = function(req, res, next) {
    proxy.web(req, res);

    if (!server) {
        setupWSProxy(req.connection.server);
    }
};

proxy.on('proxyReq', function(proxyReq, req, res, options) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug('PROXY: ' + proxyReq.method + ' ' + proxyReq.path);
});

proxy.on('proxyReqWs', function(proxyReq, req, socket, options, head) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug('PROXY: WebSocket: ' + req.method + ' ' + proxyReq.path);
});

proxy.on('proxyRes', function (proxyRes, req, res) {
    debug('PROXY: response from ' + req.originalUrl,
        JSON.stringify(proxyRes.headers, true, 2));

    // Store the notebook path for use within the WS proxy.
    if (url.parse(req.originalUrl).pathname === '/api/kernels') {
        var notebookPathHeader = req.headers['x-jupyter-notebook-path'];
        var sessionId = req.headers['x-jupyter-session-id'];
        if (!notebookPathHeader || !sessionId) {
            // TODO return error status, need notebook path to execute code
            console.error('Missing notebook path or session ID headers');
            return;
        }
        var matches = notebookPathHeader.match(/^\/notebooks\/(.*)$/);
        if (!matches) {
            // TODO error handling
            console.error('Invalid notebook path header');
            return;
        }
        sessions[sessionId] = matches[1]; // store notebook path for later use
    }
});

proxy.on('error', function(err, req, res) {
    debug('PROXY: Error with proxy server ' + err);
});

proxy.on('close', function (proxyRes, proxySocket, proxyHead) {
    // view disconnected websocket connections
    debug('PROXY: WS client disconnected');
});

module.exports = proxyRoute;
