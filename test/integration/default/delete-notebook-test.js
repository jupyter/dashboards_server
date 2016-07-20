/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var chai = require('chai');
var expect = chai.expect;
var request = require('request');
var urljoin = require('url-join');
var util = require('../it-util');

var appUrl = process.env.APP_URL;
var testNotebook = '../../etc/notebooks/demo/lorenz.ipynb';
var testBundledNotebook = '../../etc/notebooks/test/test_bundled.zip';
var getUrl = urljoin(appUrl, '/dashboards/it_notebook');
var targetUrl = urljoin(appUrl, '/_api/notebooks/it_notebook');
var badTargetUrl = urljoin(appUrl, '/_api/notebooks/it_notebook/image.jpg');

describe('delete notebook', function() {
    this.timeout(30000);
    it('should delete a notebook file', function(done) {
        // uploading test notebook file
        util.upload(targetUrl, testNotebook)
            .then(function(res) {
                // check if the notebook file is succesfully uploaded
                return new Promise(function(resolve, reject) {
                    request.get(getUrl, function(err, res, body) {
                        expect(res.statusCode).to.equal(200);
                        resolve();
                    });
                });
            })
            .then(function() {
                // delete test notebook file
                return util.delete(targetUrl)
                    .then(function(res) {
                        expect(res.statusCode).to.equal(204);
                    });
            })
            .then(function() {
                // check to see if notebook has been deleted successfully
                return new Promise(function(resolve, reject){
                    request.get(getUrl, function(err, res, body) {
                        expect(res.statusCode).to.equal(404);
                        resolve();
                    });
                });
            })
            .then(done);
    });

    it('should fail to delete a non-notebook file/directory', function(done) {
        // uploading test notebook bundle
        util.upload(targetUrl, testBundledNotebook)
            .then(function(res) {
                // check if the notebook bundle is succesfully uploaded
                return new Promise(function(resolve, reject) {
                        request.get(getUrl, function(err, res, body) {
                            expect(res.statusCode).to.equal(200);
                            resolve();
                        });
                });
            })
            .then(function() {
                // attempt to delete image file (should not be successful)
                return util.delete(badTargetUrl)
                    .then(function(res) {
                        expect(res.statusCode).to.equal(400);
                    });
            })
            .then(done);
    });

    it('should delete a bundled notebook (directory)', function(done) {
        // assume notebook bundle is already uploaded

        // delete test notebook bundle
        util.delete(targetUrl)
            .then(function(res) {
                expect(res.statusCode).to.equal(204);
            })
            .then(function() {
                // check that test notebook bundle is deleted
                return new Promise(function(resolve, reject){
                    request.get(getUrl, function(err, res, body) {
                        expect(res.statusCode).to.equal(404);
                        resolve();
                    });
                });
            })
            .then(done);
    });
});
