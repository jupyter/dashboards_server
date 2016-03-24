/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var chai = require('chai');
var expect = chai.expect;
var request = require('request');
var fs = require('fs');
var path = require('path');
var urljoin = require('url-join');

var appUrl = process.env.APP_URL;

var resourcesDir = '../../resources';
var notebookFile = path.join(resourcesDir, 'upload-notebook-test.ipynb');
var notebookFile2 = path.join(resourcesDir, 'upload-notebook-test-2.ipynb');
var badNotebookFile = path.join(resourcesDir, 'upload-notebook-test.notanipynb');

var badZip = path.join(resourcesDir, 'bad.zip');
var badZip2 = path.join(resourcesDir, 'bad2.zip');
var goodZip = path.join(resourcesDir, 'good.zip');
var goodZip2 = path.join(resourcesDir, 'good2.zip');

function upload(uploadUrl, fileUrl, cb) {
    var datapath = path.join(__dirname, fileUrl);
    var formData = {
        file: fs.createReadStream(datapath)
    };

    request.post({
        url: uploadUrl,
        formData: formData
    }, function(err, res) {
        cb(err, res);
    });
}

function randomUrl(subDir) {
    subDir = subDir || '';
    var randomName = 'it_' + Math.floor(Math.random() * 100000000);
    return {
        postUrl: urljoin(appUrl, '/_api/notebooks', subDir, randomName),
        getUrl: urljoin(appUrl, '/dashboards', subDir, randomName)
    };
}

function checkExists(getUrl, contentTest, cb) {
    request.get({
        url: getUrl
    }, function(err, res, body) {
        expect(res.statusCode).to.equal(200);
        if (contentTest) {
            expect(body).to.contain(contentTest);
        }
        cb(err, res);
    });
}

describe('upload notebook', function() {
    it('should upload a notebook', function(done) {
        var url = randomUrl();
        upload(url.postUrl, notebookFile, function(err, res, body) {
            expect(res.statusCode).to.equal(201);
            checkExists(url.getUrl, null, done);
        });
    });

    it('should return an error when attempting to upload a non-notebook file', function(done) {
        var url = randomUrl();
        upload(url.postUrl, badNotebookFile, function(err, res, body) {
            expect(res.statusCode).to.equal(500);
            done();
        });
    });

    it('should return an error when attempting to upload multiple files', function(done) {
        var datapath = path.join(__dirname, notebookFile);
        var datapath2 = path.join(__dirname, notebookFile2);
        var formData = {
            file: fs.createReadStream(datapath),
            file2: fs.createReadStream(datapath2)
        };

        request.post({
            url: randomUrl().postUrl,
            formData: formData
        }, function(err, res) {
            expect(res.statusCode).to.equal(500);
            done();
        });
    });

    it('should not delete the existing file on badly formed request', function(done) {
        var badFormData = {
            file: fs.createReadStream(path.join(__dirname, notebookFile)),
            foo: 'bar'
        };

        var url = randomUrl();
        upload(url.postUrl, notebookFile, function(err, res) {
            expect(res.statusCode).to.equal(201);

            request.post({
                url: url.postUrl,
                formData: badFormData
            }, function(err, res) {
                expect(res.statusCode).to.equal(201);
                checkExists(url.getUrl, null, done);
            });
        });
    });

    it('should not cache notebook when upload overrides existing file', function(done) {
        var url = randomUrl();
        upload(url.postUrl, notebookFile, function(err, res) {
            expect(res.statusCode).to.equal(201);

            upload(url.postUrl, notebookFile2, function(err, res) {
                expect(res.statusCode).to.equal(201);
                checkExists(url.getUrl, '2nd Upload notebook test', done);
            });
        });
    });

    it('should upload a notebook to a subdirectory', function(done) {
        // upload to /dashboards/it_dir
        var url = randomUrl('it_dir');
        upload(url.postUrl, notebookFile, function(err, res) {
            checkExists(url.getUrl, null, done);
        });
    });

    it('should allow uploading a valid ZIP with an index.ipynb', function() {
        // good.zip contains index.ipynb, hello.txt
        var url = randomUrl();
        upload(url.postUrl, goodZip, function(err, res) {
            checkExists(url.getUrl, 'Hello', function() {
                checkExists(urljoin(url.getUrl, 'hello.txt'), null, done);
            });
        });
    });

    it('should allow uploading a valid ZIP to existing location', function() {
        // good2.zip contains index.ipynb, goodbye.txt
        var url = randomUrl();
        upload(url.postUrl, goodZip, function(err, res) {
            upload(url.postUrl, goodZip2, function(err, res) {
                checkExists(url.getUrl, 'Goodbye', function() {
                    checkExists(urljoin(url.getUrl, 'goodbye.txt'), null, done);
                });
            });
        });
    });

    it('should return error when uploading a ZIP without an index.ipynb', function() {
        var url = randomUrl();
        upload(url.postUrl, badZip, function(err, res) {
            expect(res.statusCode).to.equal(500);
        });
    });

    it('should return error when uploading non-ZIP file with ".zip" extension', function() {
        var url = randomUrl();
        upload(url.postUrl, badZip2, function(err, res) {
            expect(res.statusCode).to.equal(500);
        });
    });
});
