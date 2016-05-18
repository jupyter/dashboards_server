# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

FROM node:5.5

USER root

# Install Xvfb and its dependencies needed to run Electron (Nightmare tests)
RUN apt-get update && \
    apt-get -qq install -y \
    libgtk2.0-0 \
    libgconf-2-4 \
    libasound2 \
    libxtst6 \
    libxss1 \
    libnss3 \
    libnotify-dev \
    libnotify4 \
    libgconf2-4 \
    dbus-x11 \
    xvfb

# for debugging purposes, setup node-inspector
RUN npm install -g node-inspector
# add an unprivileged node user
RUN useradd -ms /bin/bash node

USER node
RUN mkdir -p /home/node/app/ext

WORKDIR /home/node/app

# npm install separately, so it is properly cached by docker and not affected by
# changes in rest of source
ADD package.json package.json
RUN npm install --quiet

# add everything else
USER root
ADD . /home/node/app
RUN chown node:node /home/node/app && \
    chown -R node:node /home/node/app/data && \
    chown -R node:node /home/node/app/public
USER node

# build our node app
RUN npm run build

# always expose server on all interfaces in a container
ENV IP 0.0.0.0

# expose the default express http/https port (3000/3001) and the node debugger port (8080)
EXPOSE 3000 3001 8080

# default to running npm and the commands in package.json
ENTRYPOINT ["npm", "run"]
CMD ["start"]
