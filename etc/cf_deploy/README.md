This folder contains template manifests for pushing a dashboard server and kernel gateway server to Cloud Foundry (CF). Note that neither of these components is a perfect 12-factor app (e.g., kernels are stateful). Consider deploying to CF a proof-of-concept only. See the sibling [docker_deploy](../docker_deploy) folder for an alternative using Docker.

## Prerequisites

* An account on a Cloud Foundry instance
* The `cf` command line tool

## Try It

1. Use `cf` to target and authenticate with your CF provider.
2. Edit `manifest.yml` to set globally unique hostnames for both servers.
3. Edit `conda_requirements.txt` and `requirements.txt` to install any packages needed by your dashboards. The default files install the libraries necessary to run the `INTRO` demo dashboard.
4. Run:

    ```
    # get the apps running
    cf push
    
    # replace the final arg with the kernel gateway host name you picked in step 2
    cf set-env dashboards-server KERNEL_GATEWAY_URL https://your_kernel_gateway_host.your_cf_domain.com 
    
    # restart the dashboards server so that it has the new env var
    cf restart dashboards-server
    ```
