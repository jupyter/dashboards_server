[![Build Status](https://travis-ci.org/jupyter-incubator/dashboards_nodejs_app.svg?branch=master)](https://travis-ci.org/jupyter-incubator/dashboards_nodejs_app) [![Google Group](https://img.shields.io/badge/-Google%20Group-lightgrey.svg)](https://groups.google.com/forum/#!forum/jupyter)

# Jupyter Dashboards Server

This repo contains a NodeJS application that can display Jupyter notebooks as dynamic dashboards outside of the Jupyter Notebook server. The behavior of the application is similar to that of [Thebe](https://github.com/oreillymedia/thebe), but with some key technical differences:

* The notebook code is visible only in the NodeJS application backend.
* The NodeJS backend is the only actor that can send notebook code to a kernel for execution.
* The browser client can only send [Jupyter comm messages](http://jupyter-client.readthedocs.org/en/latest/messaging.html#opening-a-comm) to kernels (*not* arbitrary code).
* The application uses the jupyter-js-services and jupyter-js-widgets libraries for communication with kernels.

**Note** that this project is very much a work-in-progress as part of the [dashboards deployment roadmap](https://github.com/jupyter-incubator/dashboards/wiki/Deployment-Roadmap).

## Run It

For the moment, see the *Develop It* section. We'll provide more detail here once we make a stable release on how to run the server outside a development environment.

In the meantime, if you want to get a sense of all the configuration options, run `make help`.

## Deploy It

TBD

## Develop It

The demo requires Docker. A simple way to run [Docker](https://www.docker.com/) is to use [docker-machine](https://docs.docker.com/machine/get-started/).

If you want to do a basic run with minimal HTTP traffic logging:

1. Run `make run` to build and launch two containers:
    * kernel gateway container
    * deployed dashboard container
2. Visit `http://<external docker IP>:9700/notebooks/simple` to see a simple example notebook as a dashboard.
3. To see another notebook as a dashboard:
    * Copy the `*.ipynb` file to the `data/` directory in the project root.
    * Run `make run` again -- this should rebuild the Docker image.

If you want to enable remote debugging:

1. Invoke `make run-debug` (instead of `make run`).
2. Open `http://<external docker IP>:9711/?ws=<external docker IP>:9711&port=5858` to access the `node-inspector` and commence debugging.

If you want to enable debug logging:

1. Invoke `make run-logging` (instead `make run`).
2. Look at the server console.

If you want to run with a self-signed certificate:

```bash
make certs
HTTPS_KEY_FILE=../certs/server.pem HTTPS_CERT_FILE=../certs/server.pem make run
```
