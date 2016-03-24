/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var chai = require('chai');
var expect = chai.expect;
var request = require('request');
var fs = require('fs');
var jsdom = require('jsdom');
var Nightmare = require('nightmare');
var path = require('path');
var urljoin = require('url-join');
var util = require('../it-util');

var appUrl = process.env.APP_URL;
var getUrl = urljoin(appUrl, '/dashboards/it_bundle');
var uploadUrl = urljoin(appUrl, '/_api/notebooks/it_bundle');
var bundleFile = '../../etc/notebooks/test/test_bundled.zip';
var bundleBody;
var nightmare;

describe('dashboard with widgets', function() {
    this.timeout(10000);
    before(function(done) {
        util.upload(uploadUrl, bundleFile, function(err, res) {
            if (err) {
                throw err;
            }
            request.get(getUrl, function(err, res, body) {
                bundleBody = body;
                done();
            });
        });
    });
    beforeEach(function() {
        nightmare = Nightmare();
    });
    it('should contain ipywidgets', function(done) {
        nightmare
            .goto(getUrl)
            .wait('.widget-hslider')
            .end()
            .then(done);
    });
    it('should contain declarative widgets', function(done) {
        nightmare
            .goto(getUrl)
            .wait('urth-core-channel')
            .end()
            .then(done);
    });
    it('should interact with declarative widget', function(done) {
        var input = 'urth-core-function ~ input';
        var inputValue = 'it-test';
        nightmare
            .goto(getUrl)
            .wait(function(sel) {
                // wait for the initial input value to be programatically set
                return document.querySelector(sel).value === 'world';
            }, input)
            .insert(input)
            .insert(input, inputValue)
            .click('.invoke-btn')
            .wait(function(value) {
                // wait for the widget label to update with the input value
                return document.querySelector('#test1').textContent ===
                    'Hello ' + value + '!';
            }, inputValue)
            .end()
            .then(done);
    });
});
