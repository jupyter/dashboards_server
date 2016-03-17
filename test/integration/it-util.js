/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var fs = require('fs');
var path = require('path');
var request = require('request');

module.exports = {
    upload: function(uploadUrl, fileUrl, cb) {
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
};
