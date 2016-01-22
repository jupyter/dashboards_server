# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

.PHONY: help build certs run run-debug run-logging run-kernel-gateway kill dev-install dev debug _dev-install-ipywidgets

DASHBOARD_CONTAINER_NAME=dashboard-proxy
DASHBOARD_IMAGE_NAME=jupyter-incubator/$(DASHBOARD_CONTAINER_NAME)
KG_IMAGE_NAME=jupyter-incubator/kernel-gateway-extras
KG_CONTAINER_NAME=kernel-gateway

help:
	@echo 'Make commands:'
	@echo '             build - builds Docker images for dashboard proxy app and kernel gateway'
	@echo '              kill - stops both containers'
	@echo '             certs - generate self-signed HTTPS key and certificate files'
	@echo '               run - runs the dashboard proxy and kernel gateway containers'
	@echo '         run-debug - run + debugging through node-inspector'
	@echo '       run-logging - run + node network logging enabled'
	@echo
	@echo 'Dashboard proxy option defaults (via nconf):'
	@cat config.json

clean:
	@rm -rf certs/

build:
	@docker build -f Dockerfile.kernel -t $(KG_IMAGE_NAME) .
	@docker build -f Dockerfile.proxy -t $(DASHBOARD_IMAGE_NAME) .

certs/server.pem:
	@mkdir -p certs
	@openssl req -new \
		-newkey rsa:2048 \
		-days 365 \
		-nodes -x509 \
		-subj '/C=XX/ST=XX/L=XX/O=generated/CN=generated' \
		-keyout $@ \
		-out $@

# shortcut
certs: certs/server.pem

# Targets for running the nodejs app and kernel gateway in containers
run: | build run-kernel-gateway
	@docker run -it --rm \
		--name $(DASHBOARD_CONTAINER_NAME) \
		-p 9700:3000 \
		-p 9711:8080 \
		-e HTTPS_KEY_FILE=$(HTTPS_KEY_FILE) \
		-e HTTPS_CERT_FILE=$(HTTPS_CERT_FILE) \
		-e KERNEL_GATEWAY_URL=http://$(KG_CONTAINER_NAME):8888 \
		--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
		$(DASHBOARD_IMAGE_NAME) $(CMD)

run-debug: CMD=start-debug
run-debug: run

run-logging: CMD=start-logging
run-logging: run

run-kernel-gateway:
	@kg_is_running=`docker ps -q --filter="name=$(KG_CONTAINER_NAME)"`; \
	if [ -n "$$kg_is_running" ] ; then \
		echo "$(KG_CONTAINER_NAME) is already running."; \
	else \
		docker rm $(KG_CONTAINER_NAME); \
		docker run -d -it \
			--name $(KG_CONTAINER_NAME) \
			-p 8888:8888 \
			$(KG_IMAGE_NAME); \
	fi;

kill:
	-@docker rm -f $(DASHBOARD_CONTAINER_NAME) $(KG_CONTAINER_NAME)

test: build
		@docker run -it --rm \
			--name $(DASHBOARD_CONTAINER_NAME) \
			$(DASHBOARD_IMAGE_NAME) test

# Targets for running the nodejs app on the host
_dev-install-ipywidgets:
	-npm uninstall jupyter-js-widgets
	-rm -rf ext/ipywidgets
	@mkdir -p ext ; \
		cd ext ; \
		git clone https://github.com/ipython/ipywidgets.git ; \
		cd ipywidgets ; \
		git checkout 38218351c9dc4196419f6c8f0129df7d0f4cd24c ; \
		cd ipywidgets ; \
		npm install

dev-install: _dev-install-ipywidgets
	npm install
	npm run bower

dev: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev: run-kernel-gateway
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp

debug: KG_IP?=$$(docker-machine ip $$(docker-machine active))
debug: run-kernel-gateway
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp debug
