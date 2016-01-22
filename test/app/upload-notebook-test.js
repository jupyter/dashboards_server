/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var path = require('path');

// MODULE STUBS

var configStub = {
    get: function() {
        return 'foo'; // NOTEBOOKS_DIR
    }
};
var fsStub = {
    mkdirSync: function(){}
};

var uploadNb = proxyquire('../../app/upload-notebook', {
    './config': configStub,
    fs: fsStub
});

// TESTS

describe('app: upload-notebook', function() {
    it('should use the correct upload directory', function() {
        var req = {
            params: ['bar/name']
        };
        var cbSpy = sinon.spy();
        uploadNb.destination(req, null, cbSpy);

        expect(cbSpy).calledOnce;
        var destDir = cbSpy.firstCall.args[1];
        var expectedDir = path.join(__dirname, '../../app/', 'foo/bar');
        expect(destDir).to.equal(expectedDir);
    });
    it('should use the correct filename and add extension', function() {
        var req = {
            params: ['bar/name']
        };
        var cbSpy = sinon.spy();
        uploadNb.filename(req, null, cbSpy);

        expect(cbSpy).calledOnce;
        var filename = cbSpy.firstCall.args[1];
        expect(filename).to.equal('name.ipynb');
    });
    it('should use the correct filename with extension', function() {
        var req = {
            params: ['bar/name.ipynb']
        };
        var cbSpy = sinon.spy();
        uploadNb.filename(req, null, cbSpy);

        expect(cbSpy).calledOnce;
        var filename = cbSpy.firstCall.args[1];
        expect(filename).to.equal('name.ipynb');
    });
});
