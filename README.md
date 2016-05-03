[![Build Status](https://travis-ci.org/jupyter-incubator/dashboards_server.svg?branch=master)](https://travis-ci.org/jupyter-incubator/dashboards_server) [![Google Group](https://img.shields.io/badge/-Google%20Group-lightgrey.svg)](https://groups.google.com/forum/#!forum/jupyter)

# Jupyter Dashboards Server

A NodeJS application that can display Jupyter notebooks as dynamic dashboards outside of the Jupyter Notebook server.

![Dashboards server screenshot](etc/server_intro.png)

This repository is a portion of the `jupyter-incubator/dashboards` effort which covers:

* [Arranging](https://github.com/jupyter-incubator/dashboards) notebook outputs in a grid-layout
* [Bundling](https://github.com/jupyter-incubator/dashboards_bundlers) notebooks and associated assets for deployment as dashboards
* [Serving](https://github.com/jupyter-incubator/dashboards_server) notebook-defined dashboards as standalone web apps (**this repo**)

It is also has close ties to [jupyter-incubator/declarativewidgets](https://github.com/jupyter-incubator/declarativewidgets) which provides one way (but not the only way) of enabling rich interactivity in notebook-defined dashboards.

## What it Gives You

* Ability to run a Jupyter Notebook with [layout metadata](https://github.com/jupyter-incubator/dashboards) as a standalone dashboard application
* Ability to navigate a list of multiple notebooks and select one to run as a dashboards
* Optional shared login to secure access to the dashboard server
* Ability to add custom authentication mechanisms using the [Passport](http://passportjs.org/) middleware for Node.js
* API for POSTing notebooks to the server at runtime with optional authentication (`/_api/notebooks`)

The behavior of the application is similar to that of [Thebe](https://github.com/oreillymedia/thebe), but with some key technical differences:

* The notebook code is visible only in the NodeJS application backend.
* The NodeJS backend is the only actor that can send notebook code to a kernel for execution.
* The browser client can only send [Jupyter comm messages](http://jupyter-client.readthedocs.org/en/latest/messaging.html#opening-a-comm) to kernels (*not* arbitrary code).
* The application uses the [jupyter-js-services](https://github.com/jupyter/jupyter-js-services) and [jupyter-js-widgets](https://github.com/ipython/ipywidgets/tree/master/jupyter-js-widgets) libraries for communication with kernels.

The following libraries are known to work with the dashboard server:

* jupyter_dashboards 0.5.x
* jupyter_dashboards_bundlers 0.7.x
* ipywidgets 5.x
* jupyter_declarativewidgets 0.5.x
* Bokeh 0.11.x
* Plotly 1.9.x

## Install it

You can install the dashboard server using `npm`. 

```
npm install -g jupyter-dashboards-server
```

You can then run the dashboard server from the command line. See the next section about how to install and configure the other prerequisite components.

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

The dashboard server is meant to enable the following workflow:

1. Alice authors a notebook document using Jupyter Notebook.
2. Alice adds a dashboard layout to her notebook using the `jupyter_dashboards` extension.
3. Alice [associates required frontend assets](https://github.com/jupyter-incubator/contentmanagement/blob/master/etc/notebooks/associations_demo/associations_demo.ipynb) with her notebook.
4. Alice one-click deploys her notebook and associated assets to a `jupyter_dashboards_server` using `jupyter_dashboards_bundlers`.
5. Bob visits the dashboards server.
6. Bob interacts with Alice's notebook as a dashboard.
7. Alice updates her notebook and redeploys it to the dashboards server.

This workflow requires multiple components working in concert.

![Minimal dashboard app deployment diagram](etc/simple_deploy.png)

To bring all of these pieces together, you can start with the [`docker-compose` recipe outlined in this gist](https://gist.github.com/jhpedemonte/0e156782a7039be0ecc6fa335390bed0). Modify it to suit your needs, or bring your own DevOps tooling to bear. (We'll gladly take PRs that reduce the complexity of getting everything set up!)

Alternatively, you can clone this git repository and build the Docker images we use for development in order to run the demos in `etc/notebooks`. After setting up Docker (e.g. using [docker-machine](https://docs.docker.com/machine/get-started/)), run the following and then visit `http://<your docker host ip>:3000`.

```
make build
make examples
make demo-container
```

## Develop It

To setup a development environment, install the following on your host machine.

* Node 5.5.0
* npm 3.5.3
* gulp 3.9.0
* Docker 1.9.1
* Docker Machine 0.5.6

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

## Detailed Developer Documentation

* [Server API](https://github.com/jupyter-incubator/dashboards_server/wiki/Server-API) - server endpoints
    * Also contains information about **bundled dashboards** (allowing specification of external resources).
* [Authentication](https://github.com/jupyter-incubator/dashboards_server/wiki/Authentication) - examples of integrating 3rd-party authentication strategies
