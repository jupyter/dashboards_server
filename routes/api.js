/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var httpProxy = require('http-proxy');
var debug = require('debug')('dashboard-proxy:server');
var error = require('debug')('dashboard-proxy:server:error');
var Buffer = require('buffer').Buffer;
var BufferList = require('../node_modules/websocket/vendor/FastBufferList');
var bodyParser = require('body-parser');
var WebSocketFrame = require('websocket').frame;
var WebSocketConnection = require('websocket').connection;
var nbstore = require('../app/notebook-store');
var config = require('../app/config');
var Promise = require('es6-promise').Promise;
var request = require('request');
var url = require('url');
var urljoin = require('url-join');
var urlToDashboard = require('./url-to-dashboard');
var router = require('express').Router();

var kgUrl = config.get('KERNEL_GATEWAY_URL');
var kgAuthToken = config.get('KG_AUTH_TOKEN');
var kgBaseUrl = config.get('KG_BASE_URL');
var kgKernelRetentionTime = config.get('KG_KERNEL_RETENTIONTIME');

var server = null;
var sessions = {};
var disconnectedKernels = {};
var apiRe = new RegExp('^/api(/.*$)');
var kernelIdRe = new RegExp('^.*/kernels/([^/]*)');

// Create the proxy server instance. Don't bother to configure SSL here because
// it's not exposed directly. Rather, it's part of a proxyRoute that is used
// by the top-level app.
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
                var nbpath = urlToDashboard(sessions[payload.header.session]);
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
// var maskBytes = new Buffer(4);
// var frameHeader = new Buffer(10);
// var bufferList = new BufferList();
var wsconfig = {
    maxReceivedFrameSize: 0x10000,
    maxReceivedMessageSize: 0x100000,
    fragmentOutgoingMessages: true,
    fragmentationThreshold: 0x4000,
    keepalive: true,
    keepaliveInterval: 20000,
    dropConnectionOnKeepaliveTimeout: true,
    keepaliveGracePeriod: 10000,
    useNativeKeepalive: false,
    assembleFragments: true,
    autoAcceptConnections: false,
    ignoreXForwardedFor: false,
    disableNagleAlgorithm: true,
    closeTimeout: 5000
};

function setupWSProxy(_server) {
    debug('setting up WebSocket proxy');
    server = _server;

    // Listen to the `upgrade` event and proxy the WebSocket requests as well.
    _server.on('upgrade', function(req, socket, head) {
        debug('PROXY: WS upgrading session ' + url.parse(req.url, true).query['session_id']);

        var _emit = socket.emit;
        socket.emit = function(eventName, data) {
            if (eventName === 'data') {
                console.log('++ socket.emit(', eventName, data, ')');
            }
            _emit.apply(socket, arguments);
        };

        var conn = new WebSocketConnection(socket, [], null, false /*maskOutgoingPackets*/, wsconfig);
        // XXX maskOutgoingPackets -- to client, MUST NOT be masked; to server, MAY NEED to be masked

        // fix WS logger to print as soon as message is logged
        var oldlogfunc = conn._debug;
        conn._debug = function() {
            var logger = oldlogfunc.apply(oldlogfunc, arguments);
            oldlogfunc.printOutput();
            logger.clear();
        };

        conn.on('message', function(message) {
            console.log('++ message:', message);
        });
        conn.on('frame', function(frame) {
            console.log('++ frame:', frame);
        });
        conn.on('close', function(reasonCode, desc) {
            console.log('++ close:', reasonCode, desc);
        });
        conn.on('error', function(error) {
            console.error('++ error:', error);
        });
        conn.on('ping', function(cancel, data) {
            console.log('++ ping:', data);
        });
        conn.on('pong', function(data) {
            console.log('++ pong:', data);
        });

        conn._addSocketEventListeners();


        // var _emit = socket.emit;
        // socket.emit = function(eventName, data) {
        //
        //     // Handle TCP data
        //     if (eventName === 'data') {
        //         // Decode one or more websocket frames
        //         bufferList.write(data);
        //         var dataqueue = [];
        //         while (bufferList.length > 0) {
        //             // Parse data. `addData` returns false if we are waiting for
        //             // more data to be sent (fragmented frame).
        //             var frame = new WebSocketFrame(maskBytes, frameHeader, wsconfig);
        //
        //             var msgProcessed = true;
        //             if (!frame.addData(bufferList) || !frame.fin) {
        //                 error('insufficient data for frame');
        //                 // TODO handle large data spread across multiple frames
        //                 msgProcessed = false;
        //             }
        //             if (frame.protocolError || frame.frameTooLarge) {
        //                 error('an error occurred during parsing of WS data', frame.dropReason);
        //                 // cannot handle this message -- close socket
        //                 this.end();
        //                 return;
        //             }
        //
        //             var newdata;
        //             if (msgProcessed && frame.opcode === 0x01) { // TEXT FRAME
        //                 newdata = Promise.resolve(
        //                         substituteCodeCell(frame.binaryPayload.toString('utf8'))
        //                     )
        //                     .then(function success(data) {
        //                         data = new Buffer(data, 'utf8');
        //                         if (data.length > wsconfig.maxReceivedFrameSize) {
        //                             // TODO spread large data across multiple frames
        //                             error('buffer is too big after code substitution');
        //                             // don't send data
        //                             data = new Buffer('');
        //                         }
        //
        //                         var outframe = new WebSocketFrame(maskBytes, frameHeader, wsconfig);
        //                         outframe.opcode = 0x01; // TEXT FRAME
        //                         outframe.binaryPayload = data;
        //                         outframe.mask = frame.mask;
        //                         outframe.fin = true;
        //                         return outframe.toBuffer();
        //                     })
        //                     .catch(function failure(err) {
        //                         error('Failure when substituting code or re-encoding WS msg', err);
        //                         return new Buffer('');
        //                     });
        //             } else {
        //                 newdata = frame.toBuffer();
        //             }
        //
        //             dataqueue.push(newdata);
        //         }
        //
        //         data = Promise.all(dataqueue).then(function(arr) {
        //             return Buffer.concat(arr);
        //         });
        //     }
        //
        //     Promise.resolve(data).then(function(data) {
        //         _emit.call(socket, eventName, data);
        //     });
        // };

        // Add handler for reaping a kernel and removing sessions if the client
        // socket closes.
        //
        // Assumes kernel ID and session ID are part of request url as follows:
        //
        // /api/kernels/8c51e1d7-7a1c-4ceb-a7dd-3a567f1505b9/channels?session_id=448e417f4c9a582bcaed2905541dcff0
        var kernelIdMatched = kernelIdRe.exec(req.url);
        var kernelId = null;
        if (kernelIdMatched) {
            kernelId = kernelIdMatched[1];
        }
        var query = url.parse(req.url, true).query;
        var sessionId = query['session_id'];

        // Check if this is a reconnection
        if (disconnectedKernels[sessionId]) {
            debug('PROXY: WS reattaching to ' + sessionId);
            clearTimeout(disconnectedKernels[sessionId]);
            delete disconnectedKernels[sessionId];
        }

        // Setup a handler that schedules deletion of running kernels after
        // a timeout to give clients that accidentally disconnected time to
        // reconnect.
        socket.on('close', function() {
            debug('PROXY: WS will kill kernel ' + kernelId + ' session ' + sessionId + ' soon');
            var waiting = setTimeout(function(sessionId, kernelId) {
                debug('PROXY: WS closed for ' + sessionId);
                delete disconnectedKernels[sessionId];
                removeSession(sessionId);
                if (kernelId) {
                    killKernel(kernelId);
                }
            }, kgKernelRetentionTime, sessionId, kernelId);
            disconnectedKernels[sessionId] = waiting;
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
        if (response) {
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

// Create a kernel. Does not use the proxy instance because it must parse the
// and reserialize the request body with additional information in certain
// configurations.
router.post('/kernels', bodyParser.json({ type: 'text/plain' }), function(req, res) {
    var headers = {};
    if(kgAuthToken) {
        headers['Authorization'] = 'token ' + kgAuthToken;
    }

    // Configure the proxy for websocket connections BEFORE the first websocket
    // request. Take the opportunity to do so here.
    if (!server) {
        setupWSProxy(req.connection.server);
    }

    // Forward the user object in the session to the kernel gateway.
    if(config.get('KG_FORWARD_USER_AUTH') && req.user) {
        req.body.env = {
             KERNEL_USER_AUTH: JSON.stringify(req.user)
        }
    }

    // Pass the (modified) request to the kernel gateway.
    request({
        url: urljoin(kgUrl, kgBaseUrl, '/api/kernels'),
        method: 'POST',
        headers: headers,
        json: req.body
    }, function(err, response, body) {
        if(err) {
            error('Error proxying kernel creation request:' + err.toString());
            return res.status(500).end();
        }
        // Store the notebook path for use within the WS proxy.
        var notebookPathHeader = req.headers['x-jupyter-notebook-path'];
        var sessionId = req.headers['x-jupyter-session-id'];
        if (!notebookPathHeader || !sessionId) {
            error('Missing notebook path or session ID headers');
            return res.status(500).end();
        }
        var matches = notebookPathHeader.match(/^\/(?:dashboards(-plain)?)?(.*)$/);
        if (!matches) {
            error('Invalid notebook path header');
            return res.status(500).end();
        }
        // Store notebook path for later use
        sessions[sessionId] = matches[2];

        // Pass the kernel gateway response back to the client.
        res.set(response.headers);
        res.status(response.statusCode).json(body);
    });
});

// Proxy all unhandled requests to the kernel gateway.
router.use(function(req, res, next) {
    // NOTE: Before invoking proxy.web with a websocket upgrade request for
    // for the first time, setupWSProxy must be called on a prior request to
    // properly register for upgrade events. Otherwise, the event handler is
    // not registered in time.
    proxy.web(req, res);
    if (!server) {
        setupWSProxy(req.connection.server);
    }
});

// Add the kernel gateway authorization token before proxying.
proxy.on('proxyReq', function(proxyReq, req, res, options) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug('PROXY: ' + proxyReq.method + ' ' + proxyReq.path);
});

// Add the kernel gateway authorization token before proxying.
proxy.on('proxyReqWs', function(proxyReq, req, socket, options, head) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug('PROXY: WebSocket: ' + req.method + ' ' + proxyReq.path);
});

// Debug log all proxy responses.
proxy.on('proxyRes', function (proxyRes, req, res) {
    debug('PROXY: response from ' + req.method + " "+ req.originalUrl,
        JSON.stringify(proxyRes.headers, true, 2));
});

// Log all proxy errors.
proxy.on('error', function(err, req, res) {
    error('PROXY: Error with proxy server ' + err);
});

// Debug log all proxy disconnections.
proxy.on('close', function (proxyRes, proxySocket, proxyHead) {
    debug('PROXY: WS client disconnected');
});

module.exports = router;
