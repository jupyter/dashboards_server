/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var Promise = require('es6-promise').Promise;
var http = require('http');
var urljoin = require('url-join');

// Environment variables
var config = require('../../../app/config');
var kgUrl = config.get('KERNEL_GATEWAY_URL');
var kgAuthToken = config.get('KG_AUTH_TOKEN');
var kgBaseUrl = config.get('KG_BASE_URL');


///////////////////
// MODULE STUBS
///////////////////

var httpProxyStub = {
    createProxyServer: function() {
        return {
            on: function() {},
            web: function() {},
            ws: function() {}
        };
    }
};

var wsutilsStub = {
    decodeWebSocket: function(data) {
        return data;
    },

    encodeWebSocket: function(data) {
        return data;
    }
};

var notebookData = {
    cells: [
        {
            source: [
                'line 1;',
                'line 2;'
            ]
        },
        {
            source: [
                'line 3;',
                'line 4;'
            ]
        }
    ]
};

var nbstoreStub = {
    get: function() {
        return new Promise(function(resolve, reject) {
            resolve(notebookData);
        });
    }
};

var api = proxyquire('../../../routes/api', {
    'http-proxy': httpProxyStub,
    '../app/ws-utils': wsutilsStub,
    '../app/notebook-store': nbstoreStub
});


//////////
// TESTS
//////////

describe('routes: api', function() {

    // Get a handle to the server.on('upgrade', cb) callback function
    var serverUpgradeCallback = null;
    var req = {
        connection: {
            server: {
                on: function(topic, callback) {
                    if (topic === 'upgrade') {
                        serverUpgradeCallback = callback;
                    }
                }
            }
        },
        url: '/api/kernels/12345'
    };
    // Get a handle to the socket.on('close', cb) callback function
    var emitSpy = sinon.spy();
    var socketCloseCallback = null;
    var socket = {
        emit: emitSpy,
        on: function(topic, callback) {
            if (topic === 'close') {
                socketCloseCallback = callback;
            }
        }
    };

    before(function() {
        // initialize state of websocket handling
        api(req, {}, null);
        // should have added a server upgrade handler
        expect(serverUpgradeCallback).to.not.be.null;
        serverUpgradeCallback(req, socket, null);
        // should have added a socket close handler
        expect(socketCloseCallback).to.not.be.null;
    });

    beforeEach(function() {
        emitSpy.reset();
    });

    it('should allow execute request with integer', function(done) {
        var payload = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "0",
            }
        };
        var data = [
            {
                payload: JSON.stringify(payload)
            }
        ];
        socket.emit('data', data);

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            var emittedData = emitSpy.firstCall.args[1];
            expect(emittedData).to.have.length(1);
            expect(emittedData[0]).to.include.keys('payload');
            expect(emittedData[0].payload).to.contain('line 1;line 2;');
            done();
        }, 0);
    });

    it('should filter execute request with code', function(done) {
        // should be passed along
        var payload1 = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "0",
            }
        };
        // tests that code is filtered
        var payload2 = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "foo = 1; print(foo)",
            }
        };
        // tests that code starting with integer is also filtered
        var payload3 = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "456; foo = 1; print(foo)",
            }
        };
        var data = [
            { payload: JSON.stringify(payload1) },
            { payload: JSON.stringify(payload2) },
            { payload: JSON.stringify(payload3) }
        ];
        socket.emit('data', data);

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            var emittedData = emitSpy.firstCall.args[1];
            expect(emittedData).to.have.length(1);
            done();
        }, 0);
    });

    it('should emit all socket events', function(done) {
        socket.emit('close');

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            expect(emitSpy).to.have.been.calledWith('close');
            done();
        }, 0);
    });

    it('should kill kernel on close socket event', function(done) {
        var spy = sinon.spy(http, 'request');
        var uri = urljoin(kgUrl, kgBaseUrl, '/api/kernels/12345');

        socketCloseCallback();

        setTimeout(function() {
            expect(spy).calledOnce;
            expect(spy).to.have.been.calledWith(uri);
            var request = spy.returnValues[0];
            expect(request.method).to.equal('DELETE');
            spy.restore();
            done();
        }, 0);
    });
});
