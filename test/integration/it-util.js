/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var fs = require('fs');
var path = require('path');
var Promise = require('es6-promise').Promise;
var request = require('request');

module.exports = {
    upload: function(uploadUrl, fileUrl, cb) {
        return new Promise(function(resolve, reject) {
            var datapath = path.join(__dirname, fileUrl);
            var formData = {
                file: fs.createReadStream(datapath)
            };

            request.post({
                url: uploadUrl,
                formData: formData
            }, function(err, res, body) {
                if (cb) {
                    cb(err, res, body);
                }
                if (err) {
                    reject(err);
                } else {
                    resolve(res, body);
                }
            });
        });
    },

    delete: function(deleteUrl, cb) {
        return new Promise(function(resolve, reject) {
            request.delete({
                url: deleteUrl
            }, function(err, res, body) {
                if (cb) {
                    cb(err, res, body);
                }
                if (err) {
                    reject(err);
                } else {
                    resolve(res, body);
                }
            });
        });
    }
};
