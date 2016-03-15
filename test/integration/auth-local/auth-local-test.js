/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var sinon = require('sinon');
var chai = require('chai').use(require('sinon-chai'));
var expect = chai.expect;
var proxyquire = require('proxyquire');
var Promise = require('es6-promise').Promise;
var request = require('request');
var url = require('url');
var urljoin = require('url-join');

var appUrl = process.env.APP_URL;
var testUsername = process.env.TEST_USERNAME;
var testPassword = process.env.TEST_PASSWORD;

describe('with local auth enabled', function() {
    it('should redirect to login without a session', function(done) {
        request.get({
            url: urljoin(appUrl, '/dashboards'),
            followRedirect: false
        }, function(err, res, body) {
            expect(res.headers.location).to.equal('/login');
            expect(res.statusCode).to.equal(302);

            request.post({
                url: urljoin(appUrl, '/api/kernels'),
                followRedirect: false
            }, function(err, res, body) {
                expect(res.statusCode).to.equal(302);
                expect(res.headers.location).to.equal('/login');
                done(err);
            });
        });
    });
    it('should allow access with a valid session', function(done) {
        var jar = request.jar();

        request.post({
            url: urljoin(appUrl, '/login'),
            form: {
                username: testUsername,
                password: testPassword
            },
            followRedirect: false,
            jar: jar // binks!
        }, function(err, res, body) {
            expect(res.statusCode).to.equal(302);
            expect(res.headers.location).to.equal('/');

            request.get({
                url: urljoin(appUrl, '/dashboards'),
                followRedirect: false,
                jar: jar
            }, function(err, res, body) {
                expect(res.statusCode).to.equal(200);
                done(err);
            });
        });
    });
});
