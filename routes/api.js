/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var httpProxy = require('http-proxy');
var debug = require('debug')('dashboard-proxy:server');
var error = require('debug')('dashboard-proxy:server:error');
var Buffer = require('buffer').Buffer;
var BufferList = require('../node_modules/websocket/vendor/FastBufferList');
var WebSocketFrame = require('websocket').frame;
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

var substituteCodeCell = function(payload) {
    debug('PROXY: received message from client WS: ' + (payload));
    var transformedData = payload;

    // substitute in code if necessary
    // for performance reasons, first do a quick string check before JSON parsing
    if (payload.indexOf('execute_request') !== -1) {
        try {
            payload = JSON.parse(payload);
            if (payload.header.msg_type === 'execute_request') {
                // get notebook data for current session
                var nbpath = sessions[payload.header.session];
                transformedData = nbstore.get(nbpath).then(
                    function success(nb) {
                        // get code string for cell at index and update WS message

                        // code must be an integer corresponding to a cell index
                        var cellIdx = parseInt(payload.content.code, 10);

                        // code must only consist of a non-negative integer
                        if (cellIdx.toString(10) === payload.content.code &&
                                cellIdx >= 0) {

                            // substitute cell's actual code into the message
                            var code = nb.cells[cellIdx].source.join('');
                            payload.content.code = code;
                            payload = JSON.stringify(payload);
                        } else {
                            // throw away execute request that has non-integer code
                            payload = '';
                        }
                        return payload;
                    },
                    function failure(err) {
                        error('Failed to load notebook data for', nbpath, err);
                        return ''; // throw away execute request
                    });
            }
        } catch(e) {
            // TODO better handle parse error in WS message
            error('Failed to parse `data` in WS.', e);
            transformedData = '';
        }
    }
    return transformedData;
};

// reusable objects required by WebSocketFrame
var maskBytes = new Buffer(4);
var frameHeader = new Buffer(10);
var bufferList = new BufferList();
var wsconfig = {
    maxReceivedFrameSize: 0x100000  // 1MiB max frame size.
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
                // Decode one or more websocket frames
                bufferList.write(data);
                var dataqueue = [];
                while (bufferList.length > 0) {
                    // Parse data. `addData` returns false if we are waiting for
                    // more data to be sent (fragmented frame).
                    var frame = new WebSocketFrame(maskBytes, frameHeader, wsconfig);

                    var msgProcessed = true;
                    if (!frame.addData(bufferList) || !frame.fin) {
                        error('insufficient data for frame');
                        // TODO handle large data spread across multiple frames
                        msgProcessed = false;
                    }
                    if (frame.protocolError || frame.frameTooLarge) {
                        error('an error occurred during parsing of WS data', frame.dropReason);
                        // cannot handle this message -- close socket
                        this.end();
                        return;
                    }

                    var newdata;
                    if (msgProcessed && frame.opcode === 0x01) { // TEXT FRAME
                        newdata = Promise.resolve(
                                substituteCodeCell(frame.binaryPayload.toString('utf8'))
                            )
                            .then(function success(data) {
                                data = new Buffer(data, 'utf8');
                                if (data.length > wsconfig.maxReceivedFrameSize) {
                                    // TODO spread large data across multiple frames
                                    error('buffer is too big after code substitution');
                                    // don't send data
                                    data = new Buffer('');
                                }

                                var outframe = new WebSocketFrame(maskBytes, frameHeader, wsconfig);
                                outframe.opcode = 0x01; // TEXT FRAME
                                outframe.binaryPayload = data;
                                outframe.mask = frame.mask;
                                outframe.fin = true;
                                return outframe.toBuffer();
                            })
                            .catch(function failure(err) {
                                error('Failure when substituting code or re-encoding WS msg', err);
                                return new Buffer('');
                            });
                    } else {
                        newdata = frame.toBuffer();
                    }

                    dataqueue.push(newdata);
                }

                data = Promise.all(dataqueue).then(function(arr) {
                    return Buffer.concat(arr);
                });
            }

            Promise.resolve(data).then(function(data) {
                _emit.call(socket, eventName, data);
            });
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
    }, function(err, response, body) {
        if (error) {
          debug('PROXY: kill kernel error: ' + error);
        }
        else {
          debug('PROXY: kill kernel response: ' +
              response.statusCode + ' ' + response.statusMessage);
        }
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
            error('Missing notebook path or session ID headers');
            return;
        }
        var matches = notebookPathHeader.match(/^\/dashboards\/(.*)$/);
        if (!matches) {
            // TODO error handling
            error('Invalid notebook path header');
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
