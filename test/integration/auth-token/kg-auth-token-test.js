/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var request = require('request');

// env vars
var kgAuthToken = process.env.KG_AUTH_TOKEN;
var appUrl = process.env.APP_URL;
var kgUrl = process.env.KERNEL_GATEWAY_URL;


describe('kernel gateway auth token', function() {

    expect(kgAuthToken).to.exist;
    expect(kgAuthToken).to.not.equal('');

    it('should disallow connections without an auth token', function(done) {
        request({
            method: 'GET',
            uri: kgUrl + '/api/kernelspecs'
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(401);
            done();
        });
    });

    it('should allow connections with an auth token', function(done) {
        request({
            method: 'GET',
            uri: kgUrl + '/api/kernelspecs',
            headers: {
                Authorization: 'token ' + kgAuthToken
            }
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            done();
        });
    });

    it('should successfully load notebook (node app & gateway configured with token)', function(done) {
        request({
            method: 'GET',
            uri: appUrl + '/notebooks/simple'
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            expect(body).to.contain('<!doctype html>');
            expect(body).to.contain('Simple python dashboard');
            done();
        });
    });
});
