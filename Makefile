# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

# Only mark targets that overlap dirs as phony
.PHONY: test

# Global params
DASHBOARD_CONTAINER_NAME:=dashboard-server
DASHBOARD_IMAGE_NAME:=jupyter-incubator/$(DASHBOARD_CONTAINER_NAME)
KG_IMAGE_NAME:=jupyter-incubator/kernel-gateway-extras
KG_CONTAINER_NAME:=kernel-gateway
HTTP_PORT?=3000
HTTPS_PORT?=3001
TEST_CONTAINER_NAME:=$(DASHBOARD_CONTAINER_NAME)-test
TEST_IMAGE_NAME:=jupyter-incubator/$(TEST_CONTAINER_NAME)

help:
# http://marmelab.com/blog/2016/02/29/auto-documented-makefile.html
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
	@echo
	
help-options: ## Shows all nconf options and defaults
	@cat config.json

clean: ## Remove built dev assets
	@-rm -rf certs
	@-rm -rf data/demo data/test
	@-rm -rf node_modules
	@-rm -rf public/components
	@-rm -rf public/css

############### Docker images

kernel-gateway-image:
	@echo '-- Building kernel gateway image'
	@docker build -f Dockerfile.kernel -t $(KG_IMAGE_NAME) .

dashboard-server-image:
	@echo '-- Building dashboard server image'
	@docker build -f Dockerfile.server -t $(DASHBOARD_IMAGE_NAME) .

test-image:
	@echo '-- Building dashboard server test image'
	@docker build -f Dockerfile.test -t $(TEST_IMAGE_NAME) .

images: kernel-gateway-image dashboard-server-image test-image ## Build all dev docker images
build: images

kill: ## Kill all running docker containers
	@echo '-- Removing Docker containers'
	@-docker rm -f $(DASHBOARD_CONTAINER_NAME) $(KG_CONTAINER_NAME) $(TEST_CONTAINER_NAME) 2> /dev/null || true

############### Dashboard server development on host

dev-install: ## Install all dev deps on localhost
	npm install --quiet

dev: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev: kernel-gateway-container ## Run dashobard server on localhost
	KG_BASE_URL=$(KG_BASE_URL) KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp

dev-logging: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev-logging: kernel-gateway-container ## Run dashboard server with debug logging on localhost
	gulp build
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 npm run start-logging

dev-debug: KG_IP?=$$(docker-machine ip $$(docker-machine active))
dev-debug: kernel-gateway-container ## Run dashboard server with node debugger on localhost
	KG_BASE_URL=$(KG_BASE_URL) KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp debug

############### Dashboard server in Docker

# Command to run the dashboard server in a Docker container
define DASHBOARD_SERVER
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

############### Kernel gateway in a Docker container

define RUN_KERNEL_GATEWAY
@kg_is_running=`docker ps -q --filter="name=$(KG_CONTAINER_NAME)"`; \
if [ -n "$$kg_is_running" ] ; then \
	echo "-- $(KG_CONTAINER_NAME) is already running."; \
else \
	echo "-- Starting kernel gateway container"; \
	docker rm $(KG_CONTAINER_NAME) 2> /dev/null; \
	docker run -d \
		--name $(KG_CONTAINER_NAME) \
		-p 8888:8888 \
		-e KG_ALLOW_ORIGIN='*' \
		-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
		-e KG_BASE_URL=$(KG_BASE_URL) \
		$(KG_IMAGE_NAME); \
fi;
endef

############### Targets to start Docker containers

kernel-gateway-container:
	$(RUN_KERNEL_GATEWAY)

# targets for running nodejs app and kernel gateway containers
demo-container: KERNEL_GATEWAY_URL?=http://$(KG_CONTAINER_NAME):8888
demo-container: | build kernel-gateway-container ## Run dashboard server in a docker container
	@echo '-- Starting dashboard server container'
	$(DASHBOARD_SERVER) -it --rm \
	-e KERNEL_GATEWAY_URL=$(KERNEL_GATEWAY_URL) \
	-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
	-e KG_BASE_URL=$(KG_BASE_URL) \
	--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
	$(DASHBOARD_IMAGE_NAME) $(CMD)

debug-container: CMD=start-debug
debug-container: demo-container ## Run dashboard server with debug logging in a docker container

logging-container: CMD=start-logging
logging-container: demo-container ## Run dashboard server with node debugger in a docker container

############### Unit and integration tests

test-container: CMD?=test
test-container: SERVER_NAME?=$(TEST_CONTAINER_NAME)
test-container: DOCKER_OPTIONS?=
test-container:
	@docker run -it --rm \
		--name $(SERVER_NAME) \
		$(DOCKER_OPTIONS) \
		$(TEST_IMAGE_NAME) $(CMD)

test: | build test-container ## Run unit tests

IT_SERVER_NAME:=integration-test-server
IT_IP?=$$(docker-machine ip $$(docker-machine active))
IT_KG_PORT:=8888

define RUN_INTEGRATION_TEST
@$(MAKE) kill
$(RUN_KERNEL_GATEWAY)
@echo '-- Starting dashboard server container'
$(DASHBOARD_SERVER) -d \
	-e KERNEL_GATEWAY_URL=http://$(KG_CONTAINER_NAME):8888 \
	-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
	-e AUTH_TOKEN=$(AUTH_TOKEN) \
	-e USERNAME=$(USERNAME) \
	-e PASSWORD=$(PASSWORD) \
	--link $(KG_CONTAINER_NAME):$(KG_CONTAINER_NAME) \
	$(DASHBOARD_IMAGE_NAME)
@echo '-- Waiting 10 seconds for servers to start...'
@sleep 10
@$(MAKE) test-container \
	CMD=$(CMD) \
	SERVER_NAME=$(IT_SERVER_NAME) \
	DOCKER_OPTIONS="-e APP_URL=http://$(IT_IP):$(HTTP_PORT) \
		-e KERNEL_GATEWAY_URL=http://$(IT_IP):$(IT_KG_PORT) \
		-e KG_AUTH_TOKEN=$(KG_AUTH_TOKEN) \
		-e AUTH_TOKEN=$(AUTH_TOKEN) \
		-e TEST_USERNAME=$(USERNAME) \
		-e TEST_PASSWORD=$(PASSWORD)";
@$(MAKE) kill
endef

integration-test: | kill build integration-test-default integration-test-auth-token integration-test-auth-local ## Run integration tests

integration-test-default: CMD=integration-test
integration-test-default: | kill build
	@echo '-- Running system integration tests...'
	$(RUN_INTEGRATION_TEST)

integration-test-auth-token: CMD=integration-test-auth-token
integration-test-auth-token: KG_AUTH_TOKEN=1a2b3c4d5e6f
integration-test-auth-token: AUTH_TOKEN=7g8h9i0j
integration-test-auth-token: | kill build
	@echo '-- Running system integration tests using auth tokens...'
	$(RUN_INTEGRATION_TEST)

integration-test-auth-local: CMD=integration-test-auth-local
integration-test-auth-local: USERNAME=testuser
integration-test-auth-local: PASSWORD=testpass
integration-test-auth-local: | kill build
	@echo '-- Running system integration tests using local user auth...'
	$(RUN_INTEGRATION_TEST)
	
install-test: ## Run install/uninstall test in a container
	@echo '-- Running global install/uninstall test...'
	$(DASHBOARD_SERVER) -it --rm \
		-v `pwd`:/src \
		--user root \
		--entrypoint /bin/bash \
		$(DASHBOARD_IMAGE_NAME) \
		-c 'cd /tmp && \
			npm install --quiet /src && \
			test -f ./node_modules/.bin/jupyter-dashboards-server && \
			./node_modules/.bin/jupyter-dashboards-server --help && \
			npm uninstall --quiet jupyter-dashboards-server'

############### Self-signed HTTPS certs

certs/server.pem:
	@mkdir -p certs
	@openssl req -new \
		-newkey rsa:2048 \
		-days 365 \
		-nodes -x509 \
		-subj '/C=XX/ST=XX/L=XX/O=generated/CN=generated' \
		-keyout $@ \
		-out $@

certs: certs/server.pem ## Generate self-signed SSL certs

############### Examples/demos

# Copy directories into `data/` and unzip any bundled dashboards
data/%:
	@mkdir -p $@
	@cp -r etc/notebooks/$(@F)/* $@/
	@find data -name "*.zip" | \
		while read zipfile; do \
			unzip -q -d `dirname $$zipfile`/`basename $${zipfile%\.*}` $$zipfile ; \
			rm $$zipfile ; \
		done

examples: data/test data/demo ## Unpack demo dashobards in data/

############### npmjs.org release

release: ## Build frontend assets and release package to npmjs.org
	gulp build
	npm publish