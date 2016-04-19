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

var wsrewriterInstance;
var connCloseCallback;

var wsrewriterStub = function() {
    var _events = [];
    wsrewriterInstance = this;

    this.on = function(name, cb) {
        expect(name).to.equal('request');
        _events[name] = cb;
    };

    // utility test method
    this.__emit = function(name) {
        if (name === 'request') {
            var req = {
                resource: '/api/kernels/12345/channels'
            };
            var conn = {
                on: function(name, cb) {
                    expect(name).to.equal('close');
                    connCloseCallback = cb;
                }
            };
            _events['request'](req, conn);
        }
    };
};

var api = proxyquire('../../../routes/api', {
    'body-parser': bodyParserStub,
    'http-proxy': httpProxyStub,
    '../app/notebook-store': nbstoreStub,
    '../app/ws-rewriter': wsrewriterStub
});

var req = {
    method: 'GET',
    connection: {},
    url: '/api/kernels/12345/channels'
};

//////////////
// TEST DATA
//////////////

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

describe('kernel killing api', function() {
    var stub;

    before(function() {
        // Override request entirely since we don't care about its behavior
        stub = sinon.stub(request, 'Request');
        // initialize state of websocket handling
        api.handle(req, {}, null);
        wsrewriterInstance.__emit('request');
    });

    after(function() {
        stub.restore();
    });

    it('should kill kernel some time after the socket closed event', function(done) {
        var fakeClock = sinon.useFakeTimers();
        var uri = urljoin(kgUrl, kgBaseUrl, '/api/kernels/12345');

        connCloseCallback();
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
