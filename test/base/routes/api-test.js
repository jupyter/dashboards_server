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

// Environment variables
var config = require('../../../app/config');
var kgUrl = config.get('KERNEL_GATEWAY_URL');
var kgAuthToken = config.get('KG_AUTH_TOKEN');
var kgBaseUrl = config.get('KG_BASE_URL');
var kgKernelRetentionTime = config.get('KG_KERNEL_RETENTIONTIME');


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

var bodyParserStub = {
    json: function() {
        return (function(req, res, next) {
            next();
        });
    }
};

var api = proxyquire('../../../routes/api', {
    'http-proxy': httpProxyStub,
    'body-parser': bodyParserStub,
    '../app/notebook-store': nbstoreStub
});

// Get a handle to the server.on('upgrade', cb) callback function
var serverUpgradeCallback = null;
var req = {
    method: 'GET',
    connection: {
        server: {
            on: function(topic, callback) {
                if (topic === 'upgrade') {
                    serverUpgradeCallback = callback;
                }
            }
        }
    },
    url: '/api/kernels/12345/channels'
};

//////////
// TESTS
//////////

describe('kernel creation api', function() {
    var createReq = Object.assign({}, req, {
        method: 'POST',
        url: '/kernels',
        user: {username: 'fake-user'},
        body: {name: 'fake-kernel'},
        headers: {
            'x-jupyter-notebook-path' : '/dashboards/fake/path',
            'x-jupyter-session-id' : 'fake-session-1235'
        }
    });
    var stub;

    before(function() {
        // Override request entirely since we don't care about its behavior
        stub = sinon.stub(request, 'Request');
    });
    
    after(function() {
        stub.restore();
        config.set('KG_FORWARD_USER_AUTH', false);
    });
    
    it('should not include user auth', function() {
        config.set('KG_FORWARD_USER_AUTH', false);
        api.handle(createReq, {}, null);
        expect(createReq.body.env).to.be.undefined;
    });
    
    it('should include user auth', function() {
        config.set('KG_FORWARD_USER_AUTH', true);
        api.handle(createReq, {}, null);
        var env = createReq.body.env;
        expect(env).to.have.property('KERNEL_USER_AUTH');
        expect(JSON.parse(env.KERNEL_USER_AUTH)).to.deep.equal(createReq.user);
    });
});

describe.skip('websocket proxy api', function() {
    // Get a handle to the socket.on('close', cb) callback function
    // var emitSpy = sinon.spy();
    // var socketCloseCallback = null;
    // var socket = {
    //     emit: emitSpy,
    //     on: function(topic, callback) {
    //         if (topic === 'close') {
    //             socketCloseCallback = callback;
    //         }
    //     }
    // };
    // var stub;

    before(function() {
        // Override request entirely since we don't care about its behavior
        // stub = sinon.stub(request, 'Request');
        // // initialize state of websocket handling
        // api.handle(req, {}, null);
        // // should have added a server upgrade handler
        // expect(serverUpgradeCallback).to.not.be.null;
        // serverUpgradeCallback(req, socket, null);
        // // should have added a socket close handler
        // expect(socketCloseCallback).to.not.be.null;
    });

    beforeEach(function() {
        // emitSpy.reset();
    });
    
    after(function() {
        // stub.restore();
    });


    it('should emit all socket events', function(done) {
        socket.emit('close');

        setTimeout(function() {
            expect(emitSpy).calledOnce;
            expect(emitSpy).to.have.been.calledWith('close');
            done();
        }, 0);
    });

    it('should kill kernel some time after the socket closed event', function(done) {
        var fakeClock = sinon.useFakeTimers();
        var uri = urljoin(kgUrl, kgBaseUrl, '/api/kernels/12345');

        socketCloseCallback();
        sinon.assert.notCalled(stub);

        setTimeout(function() {
            expect(stub).calledOnce;
            var options = stub.firstCall.args[0];
            expect(options.url).to.equal(uri);
            expect(options.method).to.equal('DELETE');
            if (kgAuthToken) {
                expect(options.headers.Authorization).to.equal('token ' + kgAuthToken);
            }
            fakeClock.restore();
            done();
        }, kgKernelRetentionTime);
        fakeClock.tick(kgKernelRetentionTime + 1000);
    });
});
