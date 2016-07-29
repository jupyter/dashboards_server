/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var request = require('request');
var fs = require('fs');
var path = require('path');
var urljoin = require('url-join');
var util = require('../it-util');

var appUrl = process.env.APP_URL;
var authToken = process.env.AUTH_TOKEN;
var uploadUrl, getUrl;

var notebookFile = '../../resources/upload-notebook-test.ipynb';

function upload(headers, expectedUploadResStatus, expectedGetResStatus, done) {
    var datapath = path.join(__dirname, notebookFile);
    var formData = {
        file: fs.createReadStream(datapath)
    };

    request.post({
        url: uploadUrl,
        formData: formData,
        headers: headers
    }, function(err, res, body) {
        expect(res.statusCode).to.equal(expectedUploadResStatus);

        request.get({
            url: getUrl
        }, function(err, res, body) {
            expect(res.statusCode).to.equal(expectedGetResStatus);
            done();
        });
    });
}

function deleteDB(headers, expectedDeleteResStatus, expectedGetResStatus, done) {
    util.delete(uploadUrl, headers)
        .then(function(args) {
            var res = args.res;
            expect(res.statusCode).to.equal(expectedDeleteResStatus);
            // check that test notebook is still there
            return util.request('get', { url: getUrl })
                .then(function(args) {
                    expect(args.res.statusCode).to.equal(expectedGetResStatus);
                });
        })
        .then(done);
}

function resetCache(headers, path, expectedResetCacheResStatus, done){
    util.resetCache(path, headers)
        .then(function(args) {
            expect(args.res.statusCode).to.equal(expectedResetCacheResStatus);
        })
        .then(done);
}

describe('upload notebook with auth token', function() {
    expect(authToken).to.exist;
    expect(authToken).to.not.equal('');

    beforeEach(function() {
        var uploadName = 'it_' + Math.floor(Math.random() * 100000000);
        uploadUrl = urljoin(appUrl, '/_api/notebooks', uploadName);
        getUrl = urljoin(appUrl, '/dashboards', uploadName);
    });

    it('should upload a `notebook` with valid auth token', function(done) {
        upload({ Authorization: 'token ' + authToken }, 201, 200, done);
    });

    it('should not upload a notebook with invalid auth token', function(done) {
        upload({ Authorization: 'badtoken' }, 401, 404, done);
    });

    it('should not upload a notebook without auth token', function(done) {
        upload({}, 401, 404, done);
    });
});

describe.only('delete notebook with auth token', function() {
    before(function(done) {
        // uploading test notebook
        var uploadName = 'it_' + Math.floor(Math.random() * 100000000);
        uploadUrl = urljoin(appUrl, '/_api/notebooks', uploadName);
        getUrl = urljoin(appUrl, '/dashboards', uploadName);
        upload({ Authorization: 'token ' + authToken }, 201, 200, done);
    });

    it('should fail to delete an uploaded notebook without a valid auth token', function(done) {
        deleteDB({}, 401, 200, done);
    });

    it('should delete an uploaded notebook with valid auth token', function(done) {
        deleteDB({ Authorization: 'token ' + authToken }, 204, 404, done);
    });
});

describe('clear cache with auth token', function() {
    it('should fail to clear the cache without a valid auth token', function(done) {
        resetCache({}, '', 401, done);
    });

    it('should clear the cache with valid auth token', function(done) {
        resetCache({ Authorization: 'token ' + authToken }, '', 200, done);
    });
});
