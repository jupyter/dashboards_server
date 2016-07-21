/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var fs = require('fs');
var path = require('path');
var Promise = require('es6-promise').Promise;
var request = require('request');
var url = require('url');
var urljoin = require('url-join');

function requestPromisified(method, opts) {
    return new Promise(function(resolve, reject) {
        request[method](opts, function(err, res, body) {
            if (err) {
                reject(err);
            } else {
                resolve({ res: res, body: body});
            }
        });
    });
}

/**
 * The 'request' module does allow following redirects, but it only seems to work with GET
 * requests. This function handles this for all request methods.
 * @see https://github.com/request/request/issues/1986
 * @return {[type]} [description]
 */
function requestWithRedirect(method, opts) {
    return requestPromisified(method, opts)
        .then(function(args) {
            var res = args.res;
            if (res.statusCode >= 300 && res.statusCode < 400) {
                // redirect
                var redirectTo = res.headers.location;
                opts.url = url.resolve(res.request.uri.href, redirectTo);
                return requestPromisified(method, opts);
            }
            return args;
        });
}

module.exports = {
    /**
     * Call to 'request' module method, but promisified. If successful, resolves with object
     * containing response object (`res`) and body content (`body`). Otherwise, is rejected with
     * `err` object.
     * @param {String} method - request method: 'get', 'put', 'post', 'delete', etc
     * @param {[Object]} opts - options for `request` method
     * @return {Promise<Object>} - { res: <Response>, body: <String> }
     */
    request: requestPromisified,

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
                    resolve({ res: res, body: body});
                }
            });
        });
    },

    delete: function(deleteUrl, headers) {
        var reqOptions = {
            url: deleteUrl
        };
        if (headers) {
            reqOptions.headers = headers;
        }
        return requestPromisified('delete', reqOptions);
    },

    resetCache: function(path, headers) {
        var reqOptions = {
            url: urljoin(process.env.APP_URL, '/_api/cache', path)
        };
        if (headers) {
            reqOptions.headers = headers;
        }
        return requestWithRedirect('delete', reqOptions);
    }
};
