# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

.PHONY: help build certs \
	run run-debug run-logging run-kernel-gateway \
	run-tmpnb tmpnb-proxy tmpnb-pool kill-tmpnb token-check \
	kill dev-install dev debug _dev-install-ipywidgets

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
	@echo '         run-tmpnb - run tmpnb notebook service containers'
	@echo '        kill-tmpnb - stops tmpnb notebook service containers'
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
run: HTTP_PORT?=3000
run: HTTPS_PORT?=3001
run: | build run-kernel-gateway
	@docker run -it --rm \
		--name $(DASHBOARD_CONTAINER_NAME) \
		-p $(HTTP_PORT):$(HTTP_PORT) \
		-p $(HTTPS_PORT):$(HTTPS_PORT) \
		-p 9711:8080 \
		-e PORT=$(HTTP_PORT) \
		-e HTTPS_PORT=$(HTTPS_PORT) \
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

###### tmpnb

MAX_LOG_SIZE:=50m
MAX_LOG_ROLLOVER:=10

token-check:
	@test -n "$(TMPNB_PROXY_AUTH_TOKEN)" || \
		(echo "ERROR: TMPNB_PROXY_AUTH_TOKEN not defined (make help)"; exit 1)

tmpnb-proxy: PROXY_IMAGE?=jupyter/configurable-http-proxy@sha256:f84940db7ddf324e35f1a5935070e36832cc5c1f498efba4d69d7b962eec5d08
tmpnb-proxy: token-check
	@docker run -d \
		--name=tmpnb-proxy \
		--log-driver=json-file \
		--log-opt max-size=$(MAX_LOG_SIZE) \
		--log-opt max-file=$(MAX_LOG_ROLLOVER) \
		-p 8080:8000 \
		-e CONFIGPROXY_AUTH_TOKEN=$(TMPNB_PROXY_AUTH_TOKEN) \
		$(PROXY_IMAGE) \
			--default-target http://127.0.0.1:9999

tmpnb-pool: TMPNB_IMAGE?=jupyter/tmpnb@sha256:54c39158eb83085bc6f445772b70d975f8b747af4159474f5407cfa2e0f390c7
tmpnb-pool: POOL_SIZE?=2
tmpnb-pool: MEMORY_LIMIT?=512m
tmpnb-pool: IMAGE?=$(KG_IMAGE_NAME)
tmpnb-pool: BRIDGE_IP=$(shell docker inspect --format='{{.NetworkSettings.Networks.bridge.Gateway}}' tmpnb-proxy)
tmpnb-pool: token-check
	@docker run -d \
		--name=tmpnb-pool \
		--log-driver=json-file \
		--log-opt max-size=$(MAX_LOG_SIZE) \
		--log-opt max-file=$(MAX_LOG_ROLLOVER) \
		--net=container:tmpnb-proxy \
		-e CONFIGPROXY_AUTH_TOKEN=$(TMPNB_PROXY_AUTH_TOKEN) \
		-v /var/run/docker.sock:/docker.sock \
		$(TMPNB_IMAGE) \
		python orchestrate.py --image='$(IMAGE)' \
			--container_ip=$(BRIDGE_IP) \
			--pool_size=$(POOL_SIZE) \
			--pool_name=tmpnb \
			--cull_period=30 \
			--cull_timeout=600 \
			--max_dock_workers=16 \
			--mem_limit=$(MEMORY_LIMIT) \
			--redirect_uri=/api \
			--command='jupyter kernelgateway \
				--KernelGatewayApp.log_level=DEBUG \
				--KernelGatewayApp.ip=0.0.0.0 \
				--KernelGatewayApp.port={port} \
				--KernelGatewayApp.base_url={base_path}'

run-tmpnb: tmpnb-proxy tmpnb-pool

kill-tmpnb:
	@-docker rm -f tmpnb-pool tmpnb-proxy
	@-docker rm -f $$(docker ps -a | grep 'tmp.' | awk '{print $$1}') 2> /dev/null

###### end tmpnb

kill: kill-tmpnb
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
