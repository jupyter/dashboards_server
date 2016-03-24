# Changelog

## 0.4.0 (2016-03-24)

* Clean up examples directory and include an intro dashboard-notebook
* Support matplotlib, bokeh, plot.ly (`make examples` for a demo)
* Support PassportJS plugins for custom authentication (include Twitter and Box OAuth as examples)
* Fix support for bundled dashboards using `jupyter_declarativewidgets>=0.5.0.dev0`)
* Fix traceback output formatting in the JS console
* Fix caching of notebooks uploaded through the API
* Delay kernel cleanup on Websocket disconnect to allow reconnect within a time window
* Remove Gridstack and bower dependencies
* Update `jupyter-js-widgets` dependency to 0.0.17

## 0.3.0 (2016-03-04)

* Support bundled zip uploads containing notebooks and associated frontend assets
* Add a `/dashboards-plain` route prefix for hiding the dashboard server chrome
* Add a `PRESENTATION_MODE` option to always hide dashboard server chrome
* Show an indicator in the navbar on kernel error
* Fix layout offset due to empty widget areas
* Fix `POST /notebooks` authorization header format (missing `token` constant)
* Update dependencies (jupyter-js-services, jupyter-js-widgets)

## 0.2.0 (2016-02-18)

* Improve the styling on the login and dashboard list pages
* Use notebook file names as dashboard page titles
* Fix errors when notebook filenames have spaces
* Fix support for `%%javascript` in dashboards
* Support subdirectories on the dashboard list page
* Enable initial support for [declarative widgets](https://github.com/jupyter-incubator/declarativewidgets) in dashboard server
* Fix layout of multiple ipywidgets in the same cell
* Fix styling discrepancies between dashboard layout in Jupyter Notebook and dashboard server
* Fix dashboard list so that hidden files do not appear
* Read dashboard layout parameters from configuration
* Clean-up programmatic versus user facing routes
* Fix responsive sizing to match what Jupyter Notebook does today
* Fix support for display data output from ipywidgets
* Support token auth for in the `POST /_api/notebook` handler
* Fix deleting kernels over https
* Fix handling of host, hostname, protocol headers when proxying across domains
* Prevent errors and warnings from showing in the dashboard page
* Fix error logging
* Update dependencies (Gridstack 0.2.4, jupyter-js-notebook instead deprecated jupyter-js-output-area, websocket library)


## 0.1.0 (2016-02-03)

* Works with two very simple dev environment demos using ipywidgets and kernel gateway
* First tagged release
