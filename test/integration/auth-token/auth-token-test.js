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

var appUrl = process.env.APP_URL;
var authToken = process.env.AUTH_TOKEN;
var uploadUrl;

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
            url: uploadUrl
        }, function(err, res, body) {
            expect(res.statusCode).to.equal(expectedGetResStatus);
            done();
        });
    });
}

describe('upload notebook auth token', function() {
    expect(authToken).to.exist;
    expect(authToken).to.not.equal('');

    beforeEach(function() {
        var uploadName = 'it_' + Math.floor(Math.random() * 100000000);
        uploadUrl = urljoin(appUrl, '/notebooks', uploadName);
    });

    it('should upload a notebook with valid auth token', function(done) {
        upload({ Authorization: authToken }, 201, 200, done);
    });
    it('should not upload a notebook with invalid auth token', function(done) {
        upload({ Authorization: 'badtoken' }, 401, 404, done);
    });
    it('should not upload a notebook without auth token', function(done) {
        upload({}, 401, 404, done);
    });
});
