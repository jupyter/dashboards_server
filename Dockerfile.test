# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

FROM jupyter-incubator/dashboard-server

USER root

# Xvfb Setup
RUN chmod 744 etc/scripts/run-tests-linux
ENV DISPLAY :9.0

USER node

# run-tests script runs Xvfb before tests so Electron will work properly
# Tests are run via npm scripts with the script name specified with CMD
ENTRYPOINT ["etc/scripts/run-tests-linux"]
CMD ["test"]
