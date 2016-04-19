/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var assert = chai.assert;
var Promise = require('es6-promise').Promise;
var proxyquire = require('proxyquire');


///////////////////
// MODULE STUBS
///////////////////

var nbstoreStub = {
    get: function() {
        return new Promise(function(resolve, reject) {
            resolve(notebookData);
        });
    }
};

var websocketStub = {
    server: function() {
        this.on = function() {};
    },
    client: function() {
        this.on = function() {};
    }
};

var WsRewriter = proxyquire('../../../app/ws-rewriter', {
    './notebook-store': nbstoreStub,
    'websocket': websocketStub
});


///////////////////
// TEST DATA
///////////////////

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

describe('websocket rewriter', function() {
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
        var msg = {
            type: 'utf8',
            utf8Data: JSON.stringify(payload)
        };

        var rewriter = new WsRewriter({
            sessionToNbPath: function() {
                return '/notebook/path';
            }
        });

        rewriter._processOutgoingMsg(msg).then(function(newMsg) {
            expect(newMsg.utf8Data).to.contain('line 1;line 2;');
            done();
        })
        .catch(function(err) {
            assert.fail(err, 'payload');
        });
    });

    it('should filter execute request with code', function(done) {
        // tests that actual code is filtered
        var payload1 = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "foo = 1; print(foo)",
            }
        };
        var msg1 = {
            type: 'utf8',
            utf8Data: JSON.stringify(payload1)
        };
        // tests that code starting with integer is also filtered
        var payload2 = {
            "header": {
                "session": "12345",
                "msg_type": "execute_request"
            },
            "content": {
                "code": "456; foo = 1; print(foo)",
            }
        };
        var msg2 = {
            type: 'utf8',
            utf8Data: JSON.stringify(payload2)
        };

        var rewriter = new WsRewriter({
            sessionToNbPath: function() {
                return '/notebook/path';
            }
        });

        var msg1Promise = new Promise(function(resolve, reject) {
            rewriter._processOutgoingMsg(msg1).then(function(newMsg) {
                expect(newMsg.utf8Data).to.be.empty;
                resolve();
            })
            .catch(function(err) {
                reject(err);
            });
        });

        var msg2Promise = new Promise(function(resolve, reject) {
            rewriter._processOutgoingMsg(msg2).then(function(newMsg) {
                expect(newMsg.utf8Data).to.be.empty;
                resolve();
            })
            .catch(function(err) {
                reject(err);
            });
        });

        Promise.all([msg1Promise, msg2Promise]).then(function() {
            done();
        }).catch(function(err) {
            assert.fail(err);
        });
    });
});