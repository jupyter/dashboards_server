/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var bodyParser = require('body-parser');
var config = require('../app/config');
var debug = require('debug')('dashboard-proxy:server');
var error = require('debug')('dashboard-proxy:server:error');
var httpProxy = require('http-proxy');
var nbstore = require('../app/notebook-store');
var request = require('request');
var router = require('express').Router();
var url = require('url');
var urljoin = require('url-join');
var urlToDashboard = require('../app/url-to-dashboard');
var WsRewriter = require('../app/ws-rewriter');

var baseUrl = config.get('BASE_URL');
var proxySettings = config.get('PROXY_SETTINGS') || {};
var kgUrl = config.get('KERNEL_GATEWAY_URL');
var kgAuthToken = config.get('KG_AUTH_TOKEN');
var kgBaseUrl = config.get('KG_BASE_URL');
var kgKernelRetentionTime = config.get('KG_KERNEL_RETENTIONTIME');

var wsProxy;
var sessions = {};
var disconnectedKernels = {};
var kernelIdRe = new RegExp('^.*/kernels/([^/]*)');
var notebookPathRe;
if (baseUrl) {
    // `baseUrl` is guaranteed to end in `/`
    notebookPathRe = new RegExp('^' + (baseUrl || '/') + '(?:dashboards(-plain)?)?(/.*)$');
} else {
    notebookPathRe = new RegExp('^/(?:dashboards(-plain)?)?(/.*)$');
}

// Create the proxy server instance. Don't bother to configure SSL here because
// it's not exposed directly. Rather, it's part of a proxyRoute that is used
// by the top-level app.
var psOpts = {
    target: urljoin(kgUrl, kgBaseUrl, '/api'),
    changeOrigin: true,
    hostRewrite: true,
    autoRewrite: true,
    protocolRewrite: true
};
// set basic auth params if specified
var basicAuth;
if (proxySettings.user && proxySettings.password) {
    basicAuth = proxySettings.user + ':' + proxySettings.password;
    psOpts.auth = basicAuth;
}
// set additional request headers if specified
if (typeof proxySettings.requestHeaders === 'object') {
    psOpts.headers = proxySettings.requestHeaders;
}
var proxy = httpProxy.createProxyServer(psOpts);

function initWsProxy(server) {
    if (wsProxy) {
        return;
    }

    var headers = null;
    if (kgAuthToken) {
        // include the kg auth token if we have one
        headers = {};
        headers.Authorization = 'token ' + kgAuthToken;
    }

    // set additional request headers if specified
    if (typeof proxySettings.requestHeaders === 'object') {
        headers = Object.assign({}, proxySettings.requestHeaders, headers);
    }

    wsProxy = new WsRewriter({
        server: server,
        host: kgUrl,
        basePath: kgBaseUrl,
        headers: headers,
        requestOptions: basicAuth ? { auth: basicAuth } : null,
        sessionToNbPath: function(session) {
            return urlToDashboard(sessions[session]);
        }
    });

    // Add handler for reaping a kernel and removing sessions if the client
    // socket closes.
    //
    // Assumes kernel ID and session ID are part of request url as follows:
    //
    // /api/kernels/8c51e1d7-7a1c-4ceb-a7dd-3a567f1505b9/channels?session_id=448e417f4c9a582bcaed2905541dcff0
    wsProxy.on('request', function(req, conn) {
        var resUrl = req.resource;
        var kernelIdMatched = kernelIdRe.exec(resUrl);
        var kernelId = null;
        if (kernelIdMatched) {
            kernelId = kernelIdMatched[1];
        }
        var query = url.parse(resUrl, true).query;
        var sessionId = query['session_id'];

        // Check if this is a reconnection
        if (disconnectedKernels[sessionId]) {
            debug('WS reattaching to ' + sessionId);
            clearTimeout(disconnectedKernels[sessionId]);
            delete disconnectedKernels[sessionId];
        }

        // Setup a handler that schedules deletion of running kernels after
        // a timeout to give clients that accidentally disconnected time to
        // reconnect.
        conn.on('close', function() {
            debug('WS will kill kernel ' + kernelId + ' session ' + sessionId + ' soon');
            var waiting = setTimeout(function(sessionId, kernelId) {
                debug('WS closed for ' + sessionId);
                delete disconnectedKernels[sessionId];
                removeSession(sessionId);
                if (kernelId) {
                    killKernel(kernelId);
                }
            }, kgKernelRetentionTime, sessionId, kernelId);
            disconnectedKernels[sessionId] = waiting;
        });
    });
}

// Kill kernel on backend kernel gateway.
var killKernel = function(kernelId) {
    debug('killing kernel ' + kernelId);
    var endpoint = urljoin(kgUrl, kgBaseUrl, '/api/kernels/', kernelId);
    var headers = {};
    if (kgAuthToken) {
        headers['Authorization'] = 'token ' + kgAuthToken;
    }
    request({
        url: endpoint,
        method: 'DELETE',
        headers: headers
    }, function(err, response, body) {
        if (response) {
          debug('kill kernel response: ' +
              response.statusCode + ' ' + response.statusMessage);
        }
    });
};

// Cleanup session
var removeSession = function(sessionId) {
    debug('Removing session ' + sessionId);
    return delete sessions[sessionId];
};

// Create a kernel. Does not use the proxy instance because it must parse the
// and reserialize the request body with additional information in certain
// configurations.
router.post('/kernels', bodyParser.json({ type: 'text/plain' }), function(req, res) {
    var headers = {};
    if (kgAuthToken) {
        headers['Authorization'] = 'token ' + kgAuthToken;
    }

    // Configure the proxy for websocket connections BEFORE the first websocket
    // request. Take the opportunity to do so here.
    initWsProxy(req.connection.server);

    // Forward the user object in the session to the kernel gateway.
    if (config.get('KG_FORWARD_USER_AUTH') && req.user) {
        req.body.env = {
             KERNEL_USER_AUTH: JSON.stringify(req.user)
        };
    }

    // Get notebook path from request headers
    var notebookPathHeader = req.headers['x-jupyter-notebook-path'];
    var sessionId = req.headers['x-jupyter-session-id'];
    if (!notebookPathHeader || !sessionId) {
        error('Missing notebook path or session ID headers');
        return res.status(500).end();
    }

    var matches = notebookPathHeader.match(notebookPathRe);
    if (!matches) {
        error('Invalid notebook path header');
        return res.status(500).end();
    }

    var notebookPath = matches[2];
    // Store notebook path for later use
    sessions[sessionId] = notebookPath;

    // Retrieve notebook from store to pull out kernel name. Use this value instead
    // of that supplied by client (trust local notebook over client info).
    nbstore.get(notebookPath)
        .then(function success(notebook) {
            if (notebook.metadata.kernelspec && notebook.metadata.kernelspec.name) {
                var kernelName = notebook.metadata.kernelspec.name;
                debug('Notebook kernel name found: ' + kernelName);
                req.body.name = kernelName;
            } else {
                req.body.name = '';
            }

            // add basic auth params, if specified
            var auth;
            if (basicAuth) {
                auth = {
                    user: proxySettings.user,
                    pass: proxySettings.password
                };
            }

            // add additional headers from config, if specified
            if (typeof proxySettings.requestHeaders === 'object') {
                headers = Object.assign({}, proxySettings.requestHeaders, headers);
            }

            // Pass the (modified) request to the kernel gateway.
            debug('Issuing request for kernel', req.body);
            request({
                url: urljoin(kgUrl, kgBaseUrl, '/api/kernels'),
                method: 'POST',
                headers: headers,
                auth: auth,
                json: req.body
            }, function(err, response, body) {
                if (err) {
                    error('Error proxying kernel creation request:' + err.toString());
                    return res.status(500).end();
                }
                // Pass the kernel gateway response back to the client.
                res.set(response.headers);
                res.status(response.statusCode).json(body);
            });
        })
        .catch(function(err) {
            error('Unknown notebook path: ' + notebookPath);
            return res.status(500).end();
        });
});

// Proxy all unhandled requests to the kernel gateway.
router.use(function(req, res, next) {
    initWsProxy(req.connection.server);
    proxy.web(req, res);
});

// Add the kernel gateway authorization token before proxying.
proxy.on('proxyReq', function(proxyReq, req, res, options) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug(proxyReq.method + ' ' + proxyReq.path);
});

// Add the kernel gateway authorization token before proxying.
proxy.on('proxyReqWs', function(proxyReq, req, socket, options, head) {
    if (kgAuthToken) {
        proxyReq.setHeader('Authorization', 'token ' + kgAuthToken);
    }
    debug('WebSocket: ' + req.method + ' ' + proxyReq.path);
});

// Debug log all proxy responses.
proxy.on('proxyRes', function (proxyRes, req, res) {
    debug('response from ' + req.method + " "+ req.originalUrl,
        JSON.stringify(proxyRes.headers, true, 2));
});

// Log all proxy errors.
proxy.on('error', function(err, req, res) {
    error('PROXY: Error with proxy server ' + err);
});

// Debug log all proxy disconnections.
proxy.on('close', function (proxyRes, proxySocket, proxyHead) {
    debug('WS client disconnected');
});

module.exports = router;
