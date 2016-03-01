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
var getUrl = urljoin(appUrl, 'dashboards');
var postUrl = urljoin(appUrl, '_api/notebooks');

var indexNotebook = '../../resources/InDex.ipynb';
var notebookFile = '../../resources/upload-notebook-test.ipynb';

// upload files to test listing
function upload(uploadUrl, fileUrl, cb) {
    var datapath = path.join(__dirname, fileUrl);
    var formData = {
        file: fs.createReadStream(datapath)
    };

    request.post({
        url: urljoin(postUrl, uploadUrl),
        formData: formData
    }, function(error, response, body) {
        expect(response.statusCode).to.equal(201);
        request.get({
            url: getUrl // list URL
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            cb.apply(null, arguments);
        });
    });
}

describe('Upload and list dashboards', function() {
    it('should render dashboard list', function(done) {
        request.get({
            uri: getUrl
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            expect(body).to.contain('<!doctype html>');
            expect(body).to.contain('Dashboards');
            done();
        });
    });

    it('should list the uploaded notebook', function(done) {
        upload('upload-notebook-test', notebookFile, function(err, res, body) {
            expect(body).to.contain('<!doctype html>');
            expect(body).to.contain('upload-notebook-test');
            done();
        });
    });

    it('should render the dashboard list on notebooks path when an index notebook exists', function(done) {
        upload('InDex', indexNotebook, function(err, res, body) {
            expect(body).to.contain('<!doctype html>');
            expect(body).to.contain('Dashboards');
            expect(body).to.contain('InDex');
            done();
        });
    });

    it('should not render the dashboard list on the base path when an index notebook exists', function(done) {
        upload('InDex', indexNotebook, function(err, res, body) {
            request.get({
                url: appUrl
            }, function(error, response, body) {
                expect(response.statusCode).to.equal(200);
                expect(body).to.contain('<!doctype html>');
                expect(body).to.not.contain('Dashboards');
                done();
            });
        });
    });

    // XXX TODO revisit this test
    it('should show directory if both a directory and notebook with same name', function(done) {
        // upload a file into a folder named 'foo'
        upload('foo/bar', indexNotebook, function(err, res, body) {
            // upload a notebook named 'foo'
            upload('foo', indexNotebook, function(err, res, body) {
                request.get({
                    url: urljoin(getUrl, 'foo')
                }, function(error, response, body) {
                    expect(response.statusCode).to.equal(200);
                    expect(body).to.contain('<!doctype html>');
                    expect(body).to.contain('Dashboards');
                    expect(body).to.not.contain('foo');
                    expect(body).to.contain('bar');
                    done();
                });
            });
        });
    });
});
