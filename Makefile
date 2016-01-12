# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

.PHONY: help build run run-kernel-gateway kill dev-install dev debug _dev-install-ipywidgets

DASHBOARD_CONTAINER_NAME=dashboard-proxy
DASHBOARD_IMAGE_NAME=jupyter-incubator/$(DASHBOARD_CONTAINER_NAME)
KG_CONTAINER_NAME=kernel_gateway

KG_IP_CMD=docker inspect --format '{{ .NetworkSettings.IPAddress }}' $(KG_CONTAINER_NAME)

help:
	@echo 'Make commands:'
	@echo '             build - builds Docker image for dashboard proxy app'
	@echo '               run - runs the dashboard proxy and kernel gateway containers'
	@echo '              kill - stops both containers'

build:
	@docker build -t $(DASHBOARD_IMAGE_NAME) .

run: build run-kernel-gateway
	@kgip=`$(KG_IP_CMD)`; \
	docker run -it --rm \
		--name $(DASHBOARD_CONTAINER_NAME) \
		-p 9700:3000 \
		-e KERNEL_GATEWAY_URL=http://$$kgip:8888 \
		$(DASHBOARD_IMAGE_NAME)

# TODO change to proper kernel-gateway minimal image
run-kernel-gateway: KG_IMAGE?=jupyter-incubator/all-spark-kernels
run-kernel-gateway:
	@kg_is_running=`docker ps -q --filter="name=$(KG_CONTAINER_NAME)"`; \
	if [ -n "$$kg_is_running" ] ; then \
		echo "$(KG_CONTAINER_NAME) is already running."; \
	else \
		docker rm $(KG_CONTAINER_NAME); \
		docker run -d -it --name $(KG_CONTAINER_NAME) -p 8888:8888 $(KG_IMAGE); \
	fi;

kill:
	-@docker kill $(DASHBOARD_CONTAINER_NAME) $(KG_CONTAINER_NAME)

_dev-install-ipywidgets:
	@mkdir -p ext ; \
		cd ext ; \
		git clone https://github.com/ipython/ipywidgets.git ; \
	    cd ipywidgets ; \
	    git checkout 82d1a14df9c79bf9a913965aa9c5f14399adb805 ; \
		cd ipywidgets ; \
		npm install

dev-install: _dev-install-ipywidgets
	npm install
	npm run bower

dev: KG_IP?=192.168.99.100
dev: run-kernel-gateway
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp

debug: KG_IP?=192.168.99.100
debug: run-kernel-gateway
	KERNEL_GATEWAY_URL=http://$(KG_IP):8888 gulp debug
