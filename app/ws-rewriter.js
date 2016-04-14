/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var debug = require('debug')('dashboard-proxy:server');
var error = require('debug')('dashboard-proxy:server:error');
var EventEmitter = require('events').EventEmitter;
var nbstore = require('./notebook-store');
var Promise = require('es6-promise').Promise;
var urljoin = require('url-join');
var util = require('util');
var WebSocketServer = require('websocket').server;
var WebSocketClient = require('websocket').client;

var sessionToNbPath;

// TODO:
//  - override websocket lib's BufferingLogger

/**
 * Websocket proxy between client/browser and kernel gateway which rewrites execution requests to
 * the gateway, replacing numeric index values with the associated code block.
 *
 * Emits the following events:
 * 		'request': function(req: WebSocketRequest, conn: WebSocketConnection)
 * 			Fired when the websocket server handles a request from the client/browser.
 *
 * @param  {Object} args
 * @param  {Server} args.server - HTTP(S) server instance
 * @param  {String} args.host - kernel gateway host/domain
 * @param  {String} args.basePath - kernel gateway base URL
 * @param  {Function} args.sessionToNbPath - callback to return a notebook path for the session ID
 */
function WsRewriter(args) {
    EventEmitter.call(this);

    debug('setting up WebSocket proxy');

    var server = args.server;
    var host = args.host;
    var basePath = args.basePath;
    sessionToNbPath = args.sessionToNbPath;

    // create a websocket server which will listen for requests coming from the client/browser
    var wsserver = new WebSocketServer({
        httpServer: server,
        autoAcceptConnections: false,
        maxReceivedFrameSize: Number.MAX_SAFE_INTEGER
    });

    var rewriter = this;
    wsserver.on('request', function(req) {
        debug('ws-server connection request');

        var clientConn = createDeferred();

        // XXX verify request.origin?
        var servConn = req.accept(null, req.origin);

        // OUTGOING: client -> proxy -> kernel-gateway
        servConn.on('message', function(data) {
            clientConn.then(function(clientConn) {
                debug('OUTGOING msg :: data length = ' + (data.utf8Data||data.binaryData).length);
                processOutgoingMsg(data, function(newdata) {
                    sendSocketData(clientConn, newdata);
                });
            });
        });

        servConn.on('close', function(reasonCode, desc) {
            debug('closing WS server connection:', reasonCode, desc);
            clientConn.then(function(clientConn) {
                if (clientConn.connected) {
                    clientConn.close(reasonCode, desc);
                }
            });
        });

        // for every WS connection request from the client/browser, create a new connection to
        // the kernel gateway
        var wsclient = new WebSocketClient({
            maxReceivedFrameSize: Number.MAX_SAFE_INTEGER
        });

        wsclient.on('connect', function(_clientConn) {
            // connected to kernel gateway -- now setup proxying between client/browser & gateway
            debug('ws-client connected');
            clientConn.resolve(_clientConn);

            // INCOMING: kernel-gateway -> proxy -> client
            _clientConn.on('message', function(data) {
                debug('INCOMING msg :: data length = ' + (data.utf8Data||data.binaryData).length);
                sendSocketData(servConn, data);
            });

            _clientConn.on('close', function(reasonCode, desc) {
                debug('closing WS client connection:', reasonCode, desc);
                if (servConn.connected) {
                    servConn.close(reasonCode, desc);
                }
            });
        });

        wsclient.on('connectFailed', function(e) {
            // XXX TODO
            error('ws client failure', e);
        });
        wsclient.on('error', function(e) {
            // XXX TODO
            error('ws client error', e);
        });

        // kick off connection to kernel gateway WS
        var url = urljoin(host, basePath, req.resourceURL.path).replace(/^http/, 'ws');
        wsclient.connect(url, null);

        rewriter.emit('request', req, servConn);
    });
}
util.inherits(WsRewriter, EventEmitter);

function createDeferred() {
    var _resolve;
    var _reject;

    var promise = new Promise(function(resolve, reject) {
        _resolve = resolve;
        _reject = reject;
    });

    promise.resolve = _resolve;
    promise.reject = _reject;
    return promise;
}

/**
 * Transmit data on given WS connection
 * @param  {WebSocketConnection} conn
 * @param  {Object} data
 */
function sendSocketData(conn, data) {
    if (data.type === 'utf8') {
        conn.sendUTF(data.utf8Data);
    } else {
        conn.sendBytes(data.binaryData);
    }
}

/**
 * Rewrite (if necessary) outgoing websocket messages
 * @param  {Object}   data
 * @param  {Function} cb - invoked when (potentially rewritten) data is available
 */
function processOutgoingMsg(data, cb) {
    if (data.type === 'utf8') {
        data = substituteCodeCell(data.utf8Data).then(function(newPayload) {
            return {
                type: 'utf8',
                utf8Data: newPayload
            };
        });
    }
    Promise.resolve(data).then(function(data) {
        cb(data);
    });
}

/**
 * Rewrite websocket message data, replacing index with associated code block, if given message
 * is an execution request. Returns untouched message data for all other message types.
 * @param {String} payload - websocket message data, in JSON format
 * @return {Promise<Object>} message data; may have been changed
 */
var substituteCodeCell = function(payload) {
    var transformedData = payload;

    // substitute in code if necessary
    // for performance reasons, first do a quick string check before JSON parsing
    if (payload.indexOf('execute_request') !== -1) {
        try {
            payload = JSON.parse(payload);
            if (payload.header.msg_type === 'execute_request') {
                // get notebook data for current session
                var nbpath = sessionToNbPath(payload.header.session);
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
    return Promise.resolve(transformedData);
};

////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = WsRewriter;
