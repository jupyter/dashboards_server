[![npm version](https://img.shields.io/npm/v/jupyter-dashboards-server.svg)](https://www.npmjs.com/package/jupyter-dashboards-server)
[![Build
Status](https://travis-ci.org/jupyter-incubator/dashboards_server.svg?branch=master)](https://travis-ci.org/jupyter-incubator/dashboards_server)
[![Google
Group](https://img.shields.io/badge/-Google%20Group-lightgrey.svg)](https://groups.google.com/forum/#!forum/jupyter)

# Jupyter Dashboards Server

A NodeJS application that can display Jupyter notebooks as dynamic dashboards
outside of the Jupyter Notebook server.

![Dashboards server screenshot](etc/server_intro.png)

The Jupyter Incubator Dashboards effort covers:

1. Arranging notebook outputs in a grid- or report-like layout
2. Bundling notebooks and associated assets for deployment as dashboards
3. Serving notebook-defined dashboards as standalone web apps

This repository focuses on (3) above, while
[jupyter-incubator/dashboards](https://github.com/jupyter-incubator/dashboards)
handles (1) and
[jupyter-incubator/dashboards_bundlers](https://github.com/jupyter-incubator/dashboards_bundlers)
implements (2).

See https://github.com/jupyter-incubator/dashboards/wiki for an overview of the entire dashboard incubation effort.

## What it Gives You

* Ability to run **some** Jupyter notebooks as standalone dashboard applications
* Ability to navigate a list of multiple notebooks and select one to run as a
  dashboard
* Optional shared login to secure access to the dashboard server
* Ability to add custom authentication mechanisms using the
  [Passport](http://passportjs.org/) middleware for Node.js
* An API for POSTing notebooks to the server at runtime with optional
  authentication (`/_api/notebooks`)

The qualification in the first bullet stems from the fact that supporting
one-click deploy of notebooks with arbitrary JavaScript and kernel dependencies
is a "Really Hard Problem." We've invested effort in getting these dashboard,
visualization, and widget libraries working in the dashboard server.

* jupyter_dashboards 0.6.x
* jupyter_dashboards_bundlers 0.8.x
* ipywidgets 5.2.x
* jupyter_declarativewidgets 0.6.x
* matplotlib 1.5.x
* Bokeh 0.11.x
* Plotly 1.9.x

If you try another library and find that it does not work in the dashboard
server, see the wiki page about [Widget
Support](https://github.com/jupyter-incubator/dashboards_server/wiki/Widget-Support)
below for steps you might take to resolve the problem.

## Install it

Install Node 5.x and npm 3.5.x. Use `npm` to install the
`jupyter-dashboards-server` package.

```
npm install -g jupyter-dashboards-server
```

You can then run the dashboard server from the command line. See the next
section about how to install and configure the other prerequisite components.

```
# shows a list of all nconf options
jupyter-dashboards-server --help

# runs the server pointing to a public kernel gateway
jupyter-dashboards-server --KERNEL_GATEWAY_URL=http://my.gateway.com/

# runs the server pointing to a kernel gateway that requires token auth
export KG_AUTH_TOKEN='somesecretinenvironment'
jupyter-dashboards-server --KERNEL_GATEWAY_URL=http://my.gateway.com/
```

## Run It

The dashboard server is meant to support the [layout-bundler-deploy
workflow](https://github.com/jupyter-incubator/dashboards/wiki)
described on the project overview page. This workflow requires multiple
components working in concert.

![Minimal dashboard app deployment diagram](etc/simple_deploy.png)

To bring all of these pieces together, you can start with the [recipes in the
jupyter-incubator/dashboards_setup
repo](https://github.com/jupyter-incubator/dashboards_setup). (We'll gladly take
PRs that reduce the complexity of getting everything set up!)

Alternatively, you can clone this git repository and build the Docker images we
use for development in order to run the demos in `etc/notebooks`. After setting
up Docker (e.g. using
[docker-machine](https://docs.docker.com/machine/get-started/)), run the
following and then visit `http://<your docker host ip>:3000`.

```
make build
make examples
make demo-container
```

### Run Behind a Proxy

The dashboards server can be run behind a reverse proxy. In order to do so, you
will need to set the following options as command line args or in environment vars.

* `TRUST_PROXY` - The simple option is to just set this to `true`. However, if
  you require further configuration on which requests to trust, this option can
  also take values as specified by the [Express
  documentation](https://expressjs.com/en/guide/behind-proxies.html).
* `BASE_URL` - Specify the base URL (prefix) at which the dashboards server will
  run. The server supports two options here: passing the prefix along with the
  request or stripping the prefix off the request.

For example:

```bash
# allow proxying of "http://proxy_host/db/..." to "http://dashboards_host/db/..."
jupyter-dashboards-server --TRUST_PROXY=true --BASE_URL=/db --KERNEL_GATEWAY_URL=http://my.gateway.com/

# allow proxying of "http://proxy_host/db/..." to "http://dashboards_host/..."
jupyter-dashboards-server --TRUST_PROXY=true --BASE_URL='[/db]' --KERNEL_GATEWAY_URL=http://my.gateway.com/
```

## Develop It

To setup a development environment, install these minimum versions on your host machine.

* Node 5.5.0
* npm 3.5.3
* gulp 3.9.0
* Docker 1.9.1

With these installed, you can use the `make dev-*` targets. Run `make help` to see the full gamut of targets and options. See the next few sections for the most common patterns.

### Setup

```bash
# re-run if the Dockerfile.kernel changes
make kernel-gateway-image
# re-run if package.json changes
make dev-install
# run if you want to try the preliminary jupyter-incubator/declarativewidgets support
make examples
```

### Dashboard Server w/ Auto Restart

```bash
# uses gulp:watch to restart on any changes
make dev
# mac shortcut for visiting URL in a browser
open http://127.0.0.1:3000
```

### Dashboard Server w/ Auto Restart and Debug Console Logging

```bash
make dev-logging
# mac shortcut for visiting URL in a browser
open http://127.0.0.1:3000
```

### Dashboard Server w/ Auto Restart and Remote Debugging

```bash
npm install -g node-inspector
make dev-debug
# a browser tab should open with the debugger visible
# refresh if it errors: the server might not be running yet
```

### Dashboard Server w/ Auto Restart and Form Auth

```bash
make dev USERNAME=admin PASSWORD=password
# mac shortcut for visiting URL in a browser
open http://127.0.0.1:3000
```

See the [Authentication](https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication) wiki page for information about configuring alternative authentication mechanisms.

### Dashboard Server w/ Auto Restart and Self-Signed HTTPS Certificate

```bash
make certs
make dev HTTPS_KEY_FILE=certs/server.pem HTTPS_CERT_FILE=certs/server.pem
# mac shortcut for visiting URL in a browser
open https://127.0.0.1:3001
```

### Dashboard Server Tests

```bash
# unit tests
make test
# backend integration tests
make integration-test
# installation tests
make install-test
```

## Technical Details

See the [wiki attached to this project](https://github.com/jupyter-incubator/dashboards_server/wiki) for additional technical details including the server API, authentication plugins, adding support for new widgets, and more.
