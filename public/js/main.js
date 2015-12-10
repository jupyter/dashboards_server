// use global require.js to setup the paths for our dependencies
requirejs.config({
    paths: {
        Gridstack: require.toUrl('/components/gridstack.min'),
        lodash: require.toUrl('/components/lodash.min'),
        jquery: require.toUrl('/components/jquery.min'),
        'jquery-ui/core': require.toUrl('/components/jquery-ui/core.min'),
        'jquery-ui/mouse': require.toUrl('/components/jquery-ui/mouse.min'),
        'jquery-ui/widget': require.toUrl('/components/jquery-ui/widget.min'),
        'jquery-ui/resizable': require.toUrl('/components/jquery-ui/resizable.min'),
        'jquery-ui/draggable': require.toUrl('/components/jquery-ui/draggable.min'),
        'jupyter-js-output-area': require.toUrl('/components/jupyter-js-output-area'),
        'jupyter-js-services': require.toUrl('/components/jupyter-js-services')
    }
});
