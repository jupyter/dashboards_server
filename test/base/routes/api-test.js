/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var Promise = require('es6-promise').Promise;
var request = require('request');
var url = require('url');
var urljoin = require('url-join');
var Buffer = require('buffer').Buffer;

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

var wsframeStub = {
    frame: function(mask, frameheader, config) {
        this.fin = true;
        this.protocolError = false;
        this.frameTooLarge = false;
        this.opcode = 0x01; // TEXT FRAME
        this.mask = [1,2,3,4];

        this.addData = function(bufferlist) {
            this.binaryPayload = bufferlist._shift();
            return true;
        };

        this.toBuffer = function() {
            return this.binaryPayload;
        };
    }
};

var bufferListStub = function() {
    this.length = 0;
    return {
        write: function(data) {
            this.data = data;
            this.length = data.length;
        },
        _shift: function() {
            this.length--;
            return this.data.shift();
        }
    };
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
    'websocket': wsframeStub,
    '../app/notebook-store': nbstoreStub,
    '../node_modules/websocket/vendor/FastBufferList': bufferListStub
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
            new Buffer(JSON.stringify(payload), 'utf8')
        ];

        socket.emit('data', data);

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            var emittedData = emitSpy.firstCall.args[1].toString('utf8'); // emittedData is a Buffer
            expect(emittedData).to.contain('line 1;line 2;');
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
            new Buffer(JSON.stringify(payload1), 'utf8'),
            new Buffer(JSON.stringify(payload2), 'utf8'),
            new Buffer(JSON.stringify(payload3), 'utf8')
        ];

        socket.emit('data', data);

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            var emittedData = emitSpy.firstCall.args[1].toString('utf8'); // emittedData is a Buffer
            // should only contain `payload1`
            var payload = JSON.stringify(payload1).replace('"code":"0"', '"code":"line 1;line 2;"');
            expect(emittedData).to.equal(payload);
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
        var spy = sinon.spy(request, 'Request');
        var uri = urljoin(kgUrl, kgBaseUrl, '/api/kernels/12345');

        socketCloseCallback();

        setTimeout(function() {
            expect(spy).calledOnce;
            var options = spy.firstCall.args[0];
            expect(options.url).to.equal(uri);
            expect(options.method).to.equal('DELETE');
            if (kgAuthToken) {
                expect(options.headers.Authorization).to.equal('token ' + kgAuthToken);
            }
            spy.restore();
            done();
        }, 0);
    });
});
