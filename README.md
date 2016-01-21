# Dashboard Proxy

A NodeJS backend reference implementation for deployed dashboards. Executes notebook code securely and displays dynamic dashboard to the client in the manner of the [Dynamic Dashboards notebook extension](https://github.com/jupyter-incubator/dashboards).

## Run the demo

The demo requires docker. A simple way to run [docker](https://www.docker.com/) is to use [docker-machine](https://docs.docker.com/machine/get-started/).

1. From project root, run `make run` to launch two containers:
    * kernel gateway container
    * deployed dashboard container
2. Visit `http://<external docker IP>:9700/notebooks/simple` to deploy a simple example notebook as a dashboard.
3. To deploy another notebook as a dashboard:
    * Copy the `*.ipynb` file to the `data/` directory in the project root.
    * Run `make run` again -- this should rebuild the Docker image.

## Develop

This project uses [Node.js](nodejs.org), [npm](npmjs.com) and [gulp](http://gulpjs.com/).

1. Install the prerequisites mentioned above.
2. Run `make dev-install` in the project root in order to install project dependencies.
3. Run `KG_IP=<external docker IP> make dev` to run the dashboard proxy app.
   * In order to debug using Node Inspector, run `KG_IP=<external docker IP> make debug`.
4. Load http://localhost:3000/notebooks/simple in the browser.

### Debug from Docker container

1. Invoke `make run-debug` (instead of `make run`).
2. Open http://EXTERNAL_DOCKER_IP:9711/?ws=EXTERNAL_DOCKER_IP:9711&port=5858] to access the node-inspector and commence debugging.

## Security

* The notebook code is never made available to the client -- it is only run in our proxy server. Execution request messages from the client which contain code are ignored.
* To enable HTTPS:
    1. Optionally, Generate the key and certificate files by running `make gen-certs` to be used for development.
    If one is not generated you can skip to step 2 and use your own key/certificate.
    Note the installation of openssl is a prerequisite for this target.
    2. When running include the environment variables for the key and certificate file locations, such as:
     `HTTPS_KEY_FILE=certs/server.key HTTPS_CERT_FILE=certs/server.crt`
