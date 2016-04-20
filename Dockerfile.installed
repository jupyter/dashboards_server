# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

FROM jupyter-incubator/dashboard-server

# npm install the dashboard server app
RUN cd /home/node && npm install --quiet ./app
WORKDIR /home/node

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["./node_modules/.bin/jupyter-dashboards-server"]
