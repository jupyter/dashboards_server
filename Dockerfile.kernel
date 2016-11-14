# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

FROM jupyter/all-spark-notebook:8015c88c4b11

# Collection versions in one place. Would like to use ARG, but docker verison on
# travis does not yet support it.
ENV KERNEL_GATEWAY_VER=1.1.*
ENV IPYWIDGETS_VER=5.2.2
ENV DECLWIDGETS_VER=0.7.*

RUN pip install "jupyter_kernel_gateway==$KERNEL_GATEWAY_VER"
RUN pip install "ipywidgets==$IPYWIDGETS_VER"

# install Declarative Widgets python package
# don't bother activating the extension, not needed outside notebook
RUN pip install --pre "jupyter_declarativewidgets==$DECLWIDGETS_VER"

# also install above packages for python2
RUN bash -c "source activate python2 && \
	pip install \"ipywidgets==$IPYWIDGETS_VER\" && \
	pip install --pre \"jupyter_declarativewidgets==$DECLWIDGETS_VER\""

# run kernel gateway, not notebook server
CMD ["jupyter", "kernelgateway", "--KernelGatewayApp.ip=0.0.0.0"]
