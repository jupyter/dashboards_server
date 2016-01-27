# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

.PHONY: help build certs \
	run run-debug run-logging run-kernel-gateway \
	run-tmpnb run-tmpnb-debug run-tmpnb-logging run-tmpnb-proxy run-tmpnb-pool kill-tmpnb token-check \
	kill dev-install dev debug dev-install-ipywidgets \
	test integration-test

DASHBOARD_CONTAINER_NAME=dashboard-proxy
DASHBOARD_IMAGE_NAME=jupyter-incubator/$(DASHBOARD_CONTAINER_NAME)
KG_IMAGE_NAME=jupyter-incubator/kernel-gateway-extras
KG_CONTAINER_NAME=kernel-gateway
TMPNB_POOL_CONTAINER_NAME=tmpnb-pool
TMPNB_PROXY_CONTAINER_NAME=tmpnb-proxy
TMPNB_PROXY_AUTH_TOKEN:=devauthtokenonly
HTTP_PORT?=3000
HTTPS_PORT?=3001

help:
	@echo 'Make commands:'
	@echo '             build - builds Docker images for dashboard proxy app and kernel gateway'
	@echo '              kill - stops both containers'
	@echo '             certs - generate self-signed HTTPS key and certificate files'
	@echo '               run - runs the dashboard proxy and a single kernel gateway'
	@echo '         run-debug - run + debugging through node-inspector'
	@echo '       run-logging - run + node network logging enabled'
	@echo '         run-tmpnb - run the dashboard and tmpnb notebook service'
	@echo '   run-tmpnb-debug - run-tmpnb + debugging through node-inspector'
	@echo ' run-tmpnb-logging - run-tmpnb + node network logging enabled'
	@echo '        kill-tmpnb - stops tmpnb notebook service'
	@echo '              test - run unit tests'
	@echo '  integration-test - run integration tests'
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

# command to run the nodejs app container
define DOCKER_APP
@docker run \
	--name $(DASHBOARD_CONTAINER_NAME) \
	-p $(HTTP_PORT):$(HTTP_PORT) \
	-p $(HTTPS_PORT):$(HTTPS_PORT) \
	-p 9711:8080 \
	-e USERNAME=$(USERNAME) \
	-e PASSWORD=$(PASSWORD) \
	-e PORT=$(HTTP_PORT) \
	-e HTTPS_PORT=$(HTTPS_PORT) \
	-e HTTPS_KEY_FILE=$(HTTPS_KEY_FILE) \
	-e HTTPS_CERT_FILE=$(HTTPS_CERT_FILE) \
	-e SESSION_SECRET_TOKEN=$(SESSION_SECRET_TOKEN)
endef

# targets for running nodejs app and kernel gateway containers
run: | build run-kernel-gateway
	$(DOCKER_APP) -it --rm \
	-e KERNEL_GATEWAY_URL=http://$(KG_CONTAINER_NAME):8888 \
	-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
	-e KG_BASE_URL=$(KG_BASE_URL) \
	--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
	$(DASHBOARD_IMAGE_NAME) $(CMD)

run-debug: CMD=start-debug
run-debug: run

run-logging: CMD=start-logging
run-logging: run

# targets for running nodejs app and tmpnb containers
run-tmpnb: | build run-tmpnb-proxy run-tmpnb-pool
	$(DOCKER_APP) -it --rm \
	-e KERNEL_CLUSTER_URL=http://$(TMPNB_PROXY_CONTAINER_NAME):8000 \
	--link $(TMPNB_PROXY_CONTAINER_NAME):$(TMPNB_PROXY_CONTAINER_NAME) \
	$(DASHBOARD_IMAGE_NAME) $(CMD)

run-tmpnb-debug: CMD=start-debug
run-tmpnb-debug: run-tmpnb

run-tmpnb-logging: CMD=start-logging
run-tmpnb-logging: run-tmpnb

###### kernel gateway

run-kernel-gateway: KG_BASE_URL?=
run-kernel-gateway:
	@kg_is_running=`docker ps -q --filter="name=$(KG_CONTAINER_NAME)"`; \
	if [ -n "$$kg_is_running" ] ; then \
		echo "$(KG_CONTAINER_NAME) is already running."; \
	else \
		docker rm $(KG_CONTAINER_NAME) 2> /dev/null; \
		docker run -d \
			--name $(KG_CONTAINER_NAME) \
			-p 8888:8888 \
			-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
			-e KG_BASE_URL=$(KG_BASE_URL) \
			$(KG_IMAGE_NAME); \
	fi;

###### tmpnb

MAX_LOG_SIZE:=50m
MAX_LOG_ROLLOVER:=10

token-check:
	@test -n "$(TMPNB_PROXY_AUTH_TOKEN)" || \
		(echo "ERROR: TMPNB_PROXY_AUTH_TOKEN not defined (make help)"; exit 1)

run-tmpnb-proxy: PROXY_IMAGE?=jupyter/configurable-http-proxy@sha256:f84940db7ddf324e35f1a5935070e36832cc5c1f498efba4d69d7b962eec5d08
run-tmpnb-proxy: token-check
	@tmpnb_proxy_is_running=`docker ps -q --filter="name=$(TMPNB_PROXY_CONTAINER_NAME)"`; \
	if [ -n "$$tmpnb_proxy_is_running" ] ; then \
		echo "$(TMPNB_PROXY_CONTAINER_NAME) is already running."; \
	else \
		docker run -d \
			--name=$(TMPNB_PROXY_CONTAINER_NAME) \
			--log-driver=json-file \
			--log-opt max-size=$(MAX_LOG_SIZE) \
			--log-opt max-file=$(MAX_LOG_ROLLOVER) \
			-p 8000:8000 \
			-e CONFIGPROXY_AUTH_TOKEN=$(TMPNB_PROXY_AUTH_TOKEN) \
			$(PROXY_IMAGE) \
				--default-target http://127.0.0.1:9999; \
	fi;

run-tmpnb-pool: TMPNB_IMAGE?=jupyter/tmpnb@sha256:54c39158eb83085bc6f445772b70d975f8b747af4159474f5407cfa2e0f390c7
run-tmpnb-pool: POOL_SIZE?=2
run-tmpnb-pool: MEMORY_LIMIT?=512m
run-tmpnb-pool: IMAGE?=$(KG_IMAGE_NAME)
run-tmpnb-pool: BRIDGE_IP=$(shell docker inspect --format='{{.NetworkSettings.Networks.bridge.Gateway}}' $(TMPNB_PROXY_CONTAINER_NAME))
run-tmpnb-pool: token-check
	@tmpnb_pool_is_running=`docker ps -q --filter="name=$(TMPNB_POOL_CONTAINER_NAME)"`; \
	if [ -n "$$tmpnb_pool_is_running" ] ; then \
		echo "$(TMPNB_POOL_CONTAINER_NAME) is already running."; \
	else \
		docker run -d \
			--name=$(TMPNB_POOL_CONTAINER_NAME) \
			--log-driver=json-file \
			--log-opt max-size=$(MAX_LOG_SIZE) \
			--log-opt max-file=$(MAX_LOG_ROLLOVER) \
			--net=container:$(TMPNB_PROXY_CONTAINER_NAME) \
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
					--KernelGatewayApp.base_url={base_path}'; \
	fi;

kill-tmpnb:
	@-docker rm -f $(TMPNB_PROXY_CONTAINER_NAME) $(TMPNB_POOL_CONTAINER_NAME) 2> /dev/null || true
	@-docker rm -f $$(docker ps -a | grep 'tmp.' | awk '{print $$1}') 2> /dev/null || true

###### end tmpnb

kill: kill-tmpnb
	@-docker rm -f $(DASHBOARD_CONTAINER_NAME) $(KG_CONTAINER_NAME) 2> /dev/null || true

test: CMD?=test
test: SERVER_NAME?=$(DASHBOARD_CONTAINER_NAME)
test: DOCKER_OPTIONS?=
test: build
	@docker run -it --rm \
		--name $(SERVER_NAME) \
		$(DOCKER_OPTIONS) \
		$(DASHBOARD_IMAGE_NAME) $(CMD)

integration-test: SERVER_NAME?=integration-test-server
integration-test: IP?=$$(docker-machine ip $$(docker-machine active))
integration-test: KG_PORT?=8888
integration-test: KG_AUTH_TOKEN?=1a2b3c4d5e6f
integration-test: | kill build run-kernel-gateway
	$(DOCKER_APP) -d \
		-e KERNEL_GATEWAY_URL=http://$(KG_CONTAINER_NAME):8888 \
		-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
		--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
		$(DASHBOARD_IMAGE_NAME)
	@echo 'Waiting 30 seconds for server to start...'
	@sleep 30
	@echo 'Running system integration tests...'
	@$(MAKE) test CMD=integration-test \
		SERVER_NAME=$(SERVER_NAME) \
		DOCKER_OPTIONS="-e APP_URL=http://$(IP):$(HTTP_PORT) -e KERNEL_GATEWAY_URL=http://$(IP):$(KG_PORT) -e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN)"
	@$(MAKE) kill

# Targets for running the nodejs app on the host
dev-install-ipywidgets:
	-npm uninstall jupyter-js-widgets
	-rm -rf ext/ipywidgets
	@mkdir -p ext ; \
		cd ext ; \
		git clone https://github.com/ipython/ipywidgets.git ; \
		cd ipywidgets ; \
		git checkout 38218351c9dc4196419f6c8f0129df7d0f4cd24c ; \
		cd ipywidgets ; \
		npm install

dev-install: dev-install-ipywidgets
	npm install
	npm run bower

dev: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev: run-kernel-gateway
	KG_BASE_URL=$(KG_BASE_URL) KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp

dev-logging: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev-logging: run-kernel-gateway
	gulp build
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 npm run start-logging

debug: KG_IP?=$$(docker-machine ip $$(docker-machine active))
debug: run-kernel-gateway
	KG_BASE_URL=$(KG_BASE_URL) KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp debug
