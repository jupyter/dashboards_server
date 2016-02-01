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
var rimraf = require('rimraf');

// env vars
var appUrl = process.env.APP_URL;
var kgUrl = process.env.KERNEL_GATEWAY_URL;

var testNotebook = 'testnotebook';
var indexNotebook = 'InDex';
var uploadUrl = urljoin(appUrl, '/notebooks/' + testNotebook);
var uploadIndexUrl = urljoin(appUrl, '/notebooks/' + indexNotebook);
var notebookListUrl = urljoin(appUrl, '/notebooks');
var indexUrl = appUrl;
var dataDir = './data';
var dataDir2 = './data2';

describe('Upload and list notebooks', function() {

    before(function(done) {
        // move existing data to preserve it
        fs.rename(dataDir, dataDir2, function(err) {
            if (err) { console.error(err); }
            fs.mkdir(dataDir, function(err) {
                if (err) { console.error(err); }
                done();
            });
        });
    });

    after(function(done) {
        // delete test data and move original data back
        rimraf(dataDir, function(err) {
            if (err) { console.error(err); }
            fs.rename(dataDir2, dataDir, function(err) {
                if (err) { console.error(err); }
                done();
            });
        });
    });

    afterEach(function(done) {
        fs.readdir(dataDir, function(err, files) {
            // delete all notebooks in data dir
            rimraf(dataDir+'/*', function(err) {
                if (err) { console.error(err); }
                done();
            });
        });
    });

    it('should successfully render dashboard/notebooks table view', function(done) {
        request.get({
            uri: appUrl + '/notebooks'
        }, function(error, response, body) {
            expect(response.statusCode).to.equal(200);
            expect(body).to.contain('<!doctype html>');
            expect(body).to.contain('Dashboards');
            done();
        });
    });

    it('should list the uploaded notebook', function(done) {
         var datapath = path.join(__dirname, '../resources/' + testNotebook + '.ipynb');
         var formData = {
             file: fs.createReadStream(datapath)
         };

         request.post({
             url: uploadUrl,
             formData: formData
         }, function(error, response, body) {
             expect(response.statusCode).to.equal(201);
             request.get({
                 url: notebookListUrl
                 }, function(error, response, body) {
                     expect(response.statusCode).to.equal(200);
                     expect(body).to.contain('<!doctype html>');
                     expect(body).to.contain(testNotebook + '.ipynb');
                     done();
                 });
         });
     });

      it('should render the dashboards list view on the /notebooks path when an index notebook exists (note case insensitive index names are allowed)', function(done) {
           var datapath = path.join(__dirname, '../resources/' + indexNotebook + '.ipynb');
           var formData = {
               file: fs.createReadStream(datapath)
           };

           request.post({
               url: uploadIndexUrl,
               formData: formData
           }, function(error, response, body) {
               expect(response.statusCode).to.equal(201);
               request.get({
                   url: notebookListUrl
                   }, function(error, response, body) {
                       expect(response.statusCode).to.equal(200);
                       expect(body).to.contain('<!doctype html>');
                       expect(body).to.contain('Dashboards');
                       expect(body).to.contain(indexNotebook + '.ipynb');
                       done();
                   });
           });
       });

     it('should not render the dashboards list view on the base path when an index notebook exists (note case insensitive index names are allowed)', function(done) {
          var datapath = path.join(__dirname, '../resources/' + indexNotebook + '.ipynb');
          var formData = {
              file: fs.createReadStream(datapath)
          };

          request.post({
              url: uploadIndexUrl,
              formData: formData
          }, function(error, response, body) {
              expect(response.statusCode).to.equal(201);
              request.get({
                  url: indexUrl
                  }, function(error, response, body) {
                      expect(response.statusCode).to.equal(200);
                      expect(body).to.contain('<!doctype html>');
                      expect(body).to.not.contain('Dashboards');
                      done();
                  });
          });
      });
});
