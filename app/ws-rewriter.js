/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:server');
var error = require('debug')('dashboard-proxy:server:error');
var EventEmitter = require('events').EventEmitter;
var nbstore = require('./notebook-store');
var Promise = require('es6-promise').Promise;
var urljoin = require('url-join');
var util = require('util');
var WebSocketClient = require('websocket').client;
var WebSocketConnection = require('websocket').connection;
var WebSocketServer = require('websocket').server;

var prefixUrl = config.get('PREFIX_URL');

// 5 MB, half of tornado's (kernel gateway's) max_buffer_size
// 10 MB caused issues, see comment in tornado source code as to why (?)
var FRAGMENTATION_THRESHOLD = 0x3200000;

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
 * @param  {Object} args.headers - kernel gateway headers
 * @param  {Object} args.requestOptions - additional options passed to http(s).request() when
 *                                        connecting to kernel gateway
 * @param  {Function} args.sessionToNbPath - callback to return a notebook path for the session ID
 */
function WsRewriter(args) {
    debug('setting up WebSocket proxy');
    EventEmitter.call(this);

    this._host = args.host;
    this._basePath = args.basePath;
    this._headers = args.headers;
    this._requestOptions = args.requestOptions;
    this._sessionToNbPath = args.sessionToNbPath;

    // create a websocket server which will listen for requests coming from the client/browser
    var wsserver = new WebSocketServer({
        httpServer: args.server,
        autoAcceptConnections: false,
        maxReceivedFrameSize: Number.MAX_SAFE_INTEGER,
        maxReceivedMessageSize: Number.MAX_SAFE_INTEGER,
        fragmentationThreshold: FRAGMENTATION_THRESHOLD
    });

    wsserver.on('request', this._handleWsRequest.bind(this));
}
util.inherits(WsRewriter, EventEmitter);

WsRewriter.prototype._handleWsRequest = function(req) {
    debug('ws-server connection request');

    var self = this;
    var servConn = req.accept(null, req.origin); // accept from all origins
    setupWSLogging(servConn);

    var pendingServMsgs = [];
    function handleServMsg(data) {
        pendingServMsgs.push(data);
    }
    servConn.on('message', handleServMsg);

    function handleServClose(reasonCode, desc) {
        // client/browser closed before we established connection to kernel gateway
        wsclient.abort();
    }
    servConn.on('close', handleServClose);

    // for every WS connection request from the client/browser, create a new connection to
    // the kernel gateway
    var wsclient = new WebSocketClient({
        maxReceivedFrameSize: Number.MAX_SAFE_INTEGER,
        maxReceivedMessageSize: Number.MAX_SAFE_INTEGER,
        fragmentationThreshold: FRAGMENTATION_THRESHOLD
    });

    wsclient.on('connect', function(clientConn) {
        debug('ws-client connected');
        setupWSLogging(clientConn);
        // connected to kernel gateway -- now setup proxying between client/browser & gateway
        self._setupProxying(servConn, clientConn);
        // delete listeners that are no longer necessary
        servConn.removeListener('message', handleServMsg);
        servConn.removeListener('close', handleServClose);
        // handle pending messages
        pendingServMsgs.forEach(function(data) {
            sendSocketData(clientConn, data);
        });
    });

    wsclient.on('connectFailed', function(e) {
        // failed to connect to kernel gateway -> close connection to client/browser
        error('ws client connect failure', e);
        if (servConn.connected) {
            servConn.drop(WebSocketConnection.CLOSE_REASON_INTERNAL_SERVER_ERROR,
                'Failed to create websocket connection to kernel gateway');
        }
    });

    // kick off connection to kernel gateway WS
    var reqPath = req.resourceURL.path.replace(prefixUrl, '/'); // remove dashboard server's prefix URL
    var url = urljoin(this._host, this._basePath, reqPath).replace(/^http/, 'ws');
    wsclient.connect(url, null, null, this._headers, this._requestOptions);

    this.emit('request', req, servConn);
};

// The websocket lib logs low level websocket messaging in 'WebSocketConnection'. However, it is
// a proprietary implementation which buffers messages and doesn't print them as they happen.
// Here, we override that with the standard 'debug' impl.
function setupWSLogging(conn) {
    var _debug = conn._debug;
    if (!_debug) {
        // internal API has changed; do nothing
        console.warn('WebSocketConnection no longer has `_debug` function; can\'t setup logging');
        return;
    }
    if (!_debug.enabled) {
        // logging for websocket connection not enabled
        return;
    }

    // replace logging function
    conn._debug = require('debug')('websocket:connection');
    conn._debug.enabled = true;
}

WsRewriter.prototype._setupProxying = function(servConn, clientConn) {
    var self = this;

    // INCOMING: kernel-gateway -> proxy -> client
    clientConn.on('message', function(data) {
        debug('INCOMING msg :: data length = ' + (data.utf8Data||data.binaryData).length);
        self._processMsg({
            srcConn: clientConn,
            destConn: servConn,
            data: data,
            transformOnMsgType: 'execute_input',
            transformer: self._filterCodeProp
        });
    });

    // called after 'error' messages as well
    clientConn.on('close', function(reasonCode, desc) {
        debug('closing WS client connection:', reasonCode, desc);
        closeConnection(servConn, reasonCode, desc);
    });

    // OUTGOING: client -> proxy -> kernel-gateway
    servConn.on('message', function(data) {
        debug('OUTGOING msg :: data length = ' + (data.utf8Data||data.binaryData).length);
        self._processMsg({
            srcConn: servConn,
            destConn: clientConn,
            data: data,
            transformOnMsgType: 'execute_request',
            transformer: self._substituteCodeCell
        });
    });

    // called after 'error' messages as well
    servConn.on('close', function(reasonCode, desc) {
        debug('closing WS server connection:', reasonCode, desc);
        closeConnection(clientConn, reasonCode, desc);
    });

    // Ensure that messages are handled in the correct order by
    // promise-chaining them as they come in.
    clientConn._lastMsg = Promise.resolve();
    servConn._lastMsg = Promise.resolve();
};

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

var validProtocolCloseCodes = [1000, 1001, 1002, 1003, 1007, 1008, 1009, 1010, 1011];

/**
 * Close the websocket connection, validating the close code
 * @param  {WebSocketConnection} conn
 * @param  {Number} reasonCode - socket code for reason connection was closed
 * @param  {String} desc - user-friendly description of close reason
 */
function closeConnection(conn, reasonCode, desc) {
    if (!conn.connected) {
        return;
    }

    // Ensure that we close connection with a "valid" close code. Otherwise,
    // WebSocketConnection will just error out and not actually close the connection.
    // See WebSocketConnection's validateCloseReason()
    if (reasonCode >= 1000 && reasonCode <= 2999) {
        // reserved for use by protocol
        if (validProtocolCloseCodes.indexOf(reasonCode) === -1) {
            // non-valid code sent -- use a default instead
            reasonCode = WebSocketConnection.CLOSE_REASON_GOING_AWAY;
        }
    }

    conn.close(reasonCode, desc);
}

/**
 * Rewrite (if necessary) websocket messages (using given transformer callback) and
 * transmit to destination
 * @param  {Object} args
 * @param  {WebSocketConnection} args.srcConn - connection from which message was received
 * @param  {WebSocketConnection} args.destConn - connection to which (rewritten) message will be sent
 * @param  {Object} args.data - data from websocket message
 * @param  {String} args.transformOnMsgType - identifier for which msgs to transform
 * @param  {Function} args.transformer - callback which does the actual rewriting of the data
 */
WsRewriter.prototype._processMsg = function(args) {
    var data = args.data;
    var msgType = args.transformOnMsgType;
    var self = this;

    args.srcConn._lastMsg = args.srcConn._lastMsg.then(function() {
        if (data.type === 'utf8') {
            var payload = data.utf8Data;

            // for performance, first do a quick string check before JSON parsing
            if (payload.indexOf(msgType) !== -1) {
                return new Promise(function(resolve, reject) {
                    try {
                        payload = JSON.parse(payload);
                        if (payload.header.msg_type === msgType) {
                            args.transformer.call(self, payload)
                                .then(resolve)
                                .catch(function(e) {
                                    error('Failure transforming WS msg.', e);
                                    resolve({});
                                });
                        }
                    } catch(e) {
                        error('Failed to parse `data` in WS.', e);
                        resolve({});
                    }
                })
                .then(function(newPayload) {
                    data.utf8Data = JSON.stringify(newPayload);
                    return data;
                });
            }
            // else, fall through to returning existing data
        }

        return Promise.resolve(data);
    })
    .then(function(newdata) {
        sendSocketData(args.destConn, newdata);
    });
};

/**
 * Removes the code property value for the given websocket payload.
 * @param  {Object} payload
 * @return {Promise.<Object>}
 */
WsRewriter.prototype._filterCodeProp = function(payload) {
    if (payload.content) {
        payload.content.code = '';
    }
    return Promise.resolve(payload);
};

/**
 * Rewrite websocket message data, replacing index with associated code block
 * @param {Object} payload
 * @return {Promise.<Object>}
 */
 WsRewriter.prototype._substituteCodeCell = function(payload) {
    // get notebook data for current session
    var nbpath = this._sessionToNbPath(payload.header.session);
    return nbstore.get(nbpath)
        .then(function(nb) {
            // get code string for cell at index and update WS message

            // code must be an integer corresponding to a cell index
            var cellIdx = parseInt(payload.content.code, 10);

            // code must only consist of a non-negative integer
            if (cellIdx.toString(10) === payload.content.code &&
                    cellIdx >= 0) {

                // substitute cell's actual code into the message
                var code = nb.cells[cellIdx].source.join('');
                payload.content.code = code;
            } else {
                // throw away execute request that has non-integer code
                payload = {};
            }
            return payload;
        })
        .catch(function(err) {
            error('Failed to load notebook data for', nbpath, err);
            return {}; // throw away execute request
        });
};

////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = WsRewriter;
