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

describe('Upload and list dashboards', function() {
    it('should successfully render dashboard list', function(done) {
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
        var datapath = path.join(__dirname, notebookFile);
        var formData = {
            file: fs.createReadStream(datapath)
        };

        request.post({
            url: urljoin(postUrl, 'upload-notebook-test'),
            formData: formData
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(201);
            request.get({
                url: getUrl
            }, function(error, response, body) {
                expect(response.statusCode).to.equal(200);
                expect(body).to.contain('<!doctype html>');
                expect(body).to.contain('upload-notebook-test.ipynb');
                done();
            });
        });
    });

    it('should render the dashboard list on notebooks path when an index notebook exists', function(done) {
        // index notebook name is case-insensitive
        var datapath = path.join(__dirname, indexNotebook);
        var formData = {
            file: fs.createReadStream(datapath)
        };

        request.post({
            url: urljoin(postUrl, 'InDex'),
            formData: formData
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(201);
            request.get({
                url: getUrl
            }, function(error, response, body) {
                expect(response.statusCode).to.equal(200);
                expect(body).to.contain('<!doctype html>');
                expect(body).to.contain('Dashboards');
                expect(body).to.contain('InDex.ipynb');
                done();
            });
        });
    });

    it('should not render the dashboard list on the base path when an index notebook exists', function(done) {
        // index notebook name is case-insensitive
        var datapath = path.join(__dirname, indexNotebook);
        var formData = {
            file: fs.createReadStream(datapath)
        };

        request.post({
            url: urljoin(postUrl, 'InDex'),
            formData: formData
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(201);
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
});
