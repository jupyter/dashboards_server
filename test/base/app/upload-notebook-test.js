/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var path = require('path');
var Promise = require('es6-promise').Promise;

// MODULE STUBS

var notebooksDir = 'nbstore';
var _config = {
    DB_FILE_EXT: '.ipynb',
    NOTEBOOKS_DIR: notebooksDir
};
var configStub = {
    get: function(v) {
        return _config[v];
    }
};
var fsStub = {
    mkdir: sinon.spy(function(dir, cb) {
        cb.call();
    }),
    writeFile: sinon.spy(function(filename, data, cb) {
        cb.call();
    })
};

// used to mock busboy and file stream
function EventMock(eventResponses) {
    this.events = {};
    this.eventResponses = eventResponses; // { event: [args] }
}
EventMock.prototype.on = function(event, cb) {
    // register an event handler
    this.events[event] = cb;

    // auto-invoke the event callback if defined in this.eventReponses
    if (this.eventResponses[event]) {
        this.invoke(event, this.eventResponses[event]);
    }
};
EventMock.prototype.invoke = function(event, args) {
    // manually call event handlers
    this.events[event].apply(this, args);
};

var projectRoot = '../../../';
var appDir = path.join(projectRoot, '/app');
var nbstore = proxyquire(path.join(appDir, '/notebook-store'), {
    './config': configStub,
    'fs-extra': fsStub,
    busboy: EventMock
});

// TEST HELPERS

function uploadFile(req, originalname, next) {
    // mock the event flow
    req.pipe = function(busboy) {
        var fileMock = new EventMock({
            data: [new Buffer('test')],
            end: []
        });
        busboy.invoke('file', ['', fileMock, originalname]);
        busboy.invoke('finish');
    };
    nbstore.upload(req, null, next);
}

function uploadFileTest(uploadPath, originalname, finalname) {
    var dirname = path.dirname(uploadPath);
    var nbName = path.basename(uploadPath);
    var req = {
        params: [uploadPath]
    };

    return new Promise(function(resolve, reject) {
        function next(err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
            done();
        }
        uploadFile(req, originalname, next);
    }).then(function() {
        expect(fsStub.mkdir).calledOnce;
        var destination = fsStub.mkdir.firstCall.args[0];
        var dest = path.join(notebooksDir, dirname);
        expect(destination).to.equal(dest);

        expect(fsStub.writeFile).calledOnce;
        var filename = fsStub.writeFile.firstCall.args[0];
        var fn = path.join(dest, finalname);
        expect(filename).to.equal(fn);
    });
}

// TESTS

describe('app: upload-notebook', function() {
    beforeEach(function() {
        fsStub.mkdir.reset();
        fsStub.writeFile.reset();
    });

    it('should upload the file and add extension', function() {
        return uploadFileTest('bar/newname', 'nbname.ipynb', 'newname.ipynb');
    });
    it('should upload the file with extension', function() {
        return uploadFileTest('bar/newname.ipynb', 'nbname.ipynb', 'newname.ipynb');
    });
});
