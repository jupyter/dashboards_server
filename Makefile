# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

.PHONY: help build run run-debug run-logging run-kernel-gateway kill dev-install dev debug _dev-install-ipywidgets

DASHBOARD_CONTAINER_NAME=dashboard-proxy
DASHBOARD_IMAGE_NAME=jupyter-incubator/$(DASHBOARD_CONTAINER_NAME)
KG_IMAGE_NAME=jupyter-incubator/kernel-gateway-extras
KG_CONTAINER_NAME=kernel-gateway

help:
	@echo 'Make commands:'
	@echo '             build - builds Docker images for dashboard proxy app and kernel gateway'
	@echo '              kill - stops both containers'
	@echo '         gen-certs - generate self-signed HTTPS key and certificate files'
	@echo '               run - runs the dashboard proxy and kernel gateway containers'
	@echo '         run-debug - run + debugging through node-inspector'
	@echo '       run-logging - run + node network logging enabled'

build:
	@docker build -f Dockerfile.kernel -t $(KG_IMAGE_NAME) .
	@docker build -f Dockerfile.proxy -t $(DASHBOARD_IMAGE_NAME) .

gen-certs:
	@mkdir -p certs && \
		cd certs && \
		openssl genrsa -des3 -out server.enc.key 1024 && \
		openssl req -new -key server.enc.key -out server.csr && \
		openssl rsa -in server.enc.key -out server.key && \
		openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Targets for running the nodejs app and kernel gateway in containers
run: CMD?=
run: | build run-kernel-gateway
	@docker run -it --rm \
		--name $(DASHBOARD_CONTAINER_NAME) \
		-p 9700:3000 \
		-p 9711:8080 \
		-e KERNEL_GATEWAY_URL=http://$(KG_CONTAINER_NAME):8888 \
		--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
		$(DASHBOARD_IMAGE_NAME) $(CMD)

run-debug:
	$(MAKE) run CMD=start-debug

run-logging:
	$(MAKE) run CMD=start-logging

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
