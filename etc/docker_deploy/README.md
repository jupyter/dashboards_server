This folder contains template manifests for deploying a dashboard server, kernel gateway server, and notebook server to a Docker host. Consider this a recipe that will need tuning for your particular environment. See the sibling [cf_deploy](../cf_deploy) folder for an alternative using Cloud Foundry.

## Prerequisites

* Docker Compose 1.6.0+
* Docker Engine 1.10.0+
* Docker Machine 0.6.0+ (or suitable docker environment)

## Try It

```
eval $(docker-machine env your_host)
docker-compose build  # add --no-cache --force-rm if switching versions
docker-compose up
```

After running the above, open a browser to `http://<your docker host IP>:8888` to access the notebook server. Open the hello world notebook, run it, switch to dashboard mode to see it working. Then use the *File &rarr; Deploy As &rarr; Dashboard on Jupyter Dashboard Server*. After deploying, the notebook server will automatically redirect you to the dashboard server running on `http://<your docker host IP>:3000`. Login with `demo` as the username and password.

If you want to run the `taxi_demo_grid` or `meetup-streaming` notebooks on the dashboard server, make sure you run them first in the notebook server so that all of the declarative widgets are available for deployment.

## See It

![Notebook to dashboard screencast](https://ibm.box.com/shared/static/ftjiytnmjabf6awg9oxywosgpbq9o9fd.gif)
