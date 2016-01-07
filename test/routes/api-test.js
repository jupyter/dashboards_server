/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var Promise = require('es6-promise').Promise;

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

var api = proxyquire('../../routes/api', {
    'http-proxy': httpProxyStub,
    '../app/ws-utils': wsutilsStub,
    '../app/notebook-store': nbstoreStub
});


//////////
// TESTS
//////////

describe('routes: api', function() {
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
        url: '/api/kernel'
    };
    var emitSpy = sinon.spy();
    var socket = {
        emit: emitSpy
    };

    before(function() {
        // initialize state of websocket handling
        api(req, {}, null);
        expect(serverUpgradeCallback).to.not.be.null;
        serverUpgradeCallback(req, socket, null);
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
});
