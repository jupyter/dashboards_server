/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var request = require('request');
var fs = require('fs');
var jsdom = require('jsdom');
var path = require('path');
var urljoin = require('url-join');

var appUrl = process.env.APP_URL;
var getUrl = urljoin(appUrl, 'dashboards');
var postUrl = urljoin(appUrl, '_api/notebooks');

var indexNotebook = '../../resources/index.ipynb';
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

    it('should not render the dashboard list on the base path when an index notebook exists', function(done) {
        upload('index', indexNotebook, function(err, res, body) {
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

    it('should show dashboard if both a directory and notebook with same name exist', function(done) {
        // upload a file into a directory
        upload('it_dupe/it_foo', indexNotebook, function(err, res, body) {
            // upload a notebook with the same name as the directory
            upload('it_dupe', indexNotebook, function(err, res, body) {
                request.get({
                    url: urljoin(getUrl, 'it_dupe')
                }, function(error, response, body) {
                    expect(response.statusCode).to.equal(200);
                    expect(body).to.contain('<!doctype html>');
                    expect(body).to.not.contain('Dashboards');
                    expect(body).to.contain('Index Notebook');
                    done();
                });
            });
        });
    });

    it('should show parent directory link when listing subdirectory', function(done) {
        upload('it_dir/it_foo', indexNotebook, function() {
            request.get({
                url: urljoin(getUrl, 'it_dir')
            }, function(err, res, body) {
                expect(res.statusCode).to.equal(200);

                jsdom.env(body, function(err, window) {
                    if (err) {
                        throw err;
                    }
                    var parentDirText = window.document
                        .querySelector('#list-container > ul > li:not(.list-header).list-group-item')
                        .textContent.trim();
                    window.close(); // free up memory
                    expect(parentDirText).to.equal('..');
                    done();
                });
            });
        });
    });
});
