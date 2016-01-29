/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var gulp = require('gulp'),
    nodemon = require('gulp-nodemon'),
    plumber = require('gulp-plumber'),
    livereload = require('gulp-livereload'),
    less = require('gulp-less'),
    open = require('gulp-open'),
    webpack = require('gulp-webpack'),
    source = require('vinyl-source-stream'),
    merge = require('merge-stream');

gulp.task('webpack:components', function() {
    var components = [
        'jupyter-js-services',
        'jupyter-js-output-area'
    ];
    var tasks = components.map(function(compName) {
        return gulp.src('node_modules/' + compName + '/lib/index.js')
            .pipe(webpack({
                module: {
                    loaders: [
                        { test: /\.css$/, loader: "style-loader!css-loader" },
                        { test: /\.json$/, loader: "json-loader" }
                    ]
                },
                output: {
                    filename: compName + '.js',
                    libraryTarget: 'umd'
                },
            }))
            .pipe(gulp.dest('./public/components'));
    });

    var widgets_task = gulp.src('node_modules/jupyter-js-widgets/index.js')
        .pipe(webpack( require('./webpack.config.js') ))
        .pipe(gulp.dest('./public/components'));

    return merge(tasks, widgets_task);
});

// copy source into `public/components`
gulp.task('copy:components', function() {
    var c1 = gulp.src([
            './node_modules/requirejs/require.js',
            './node_modules/jupyter-js-widgets/static/widgets/css/widgets.min.css',
            './bower_components/gridstack/dist/gridstack.min.js',
            './bower_components/gridstack/dist/gridstack.min.css',
            './bower_components/jquery/dist/jquery.min.js',
            './bower_components/jquery-ui/jquery-ui.min.js',
            './bower_components/lodash/dist/lodash.min.js'
        ])
        .pipe(gulp.dest('./public/components'));
    var c2 = gulp.src([
            './bower_components/jquery-ui/ui/minified/core.min.js',
            './bower_components/jquery-ui/ui/minified/mouse.min.js',
            './bower_components/jquery-ui/ui/minified/widget.min.js',
            './bower_components/jquery-ui/ui/minified/resizable.min.js',
            './bower_components/jquery-ui/ui/minified/draggable.min.js',
            './bower_components/jquery-ui/themes/smoothness/jquery-ui.min.css',
        ]).pipe(gulp.dest('./public/components/jquery-ui'));
    var c3 = gulp.src([
            './bower_components/jquery-ui/themes/smoothness/images/**/*'
        ]).pipe(gulp.dest('./public/components/jquery-ui/images'));
    var c4 = gulp.src([
            './node_modules/bootstrap/dist/**/*'
        ]).pipe(gulp.dest('./public/components/bootstrap'));
    return merge(c1, c2, c3, c4);
});

gulp.task('less', function () {
    gulp.src('./less/style.less')
        .pipe(plumber())
        .pipe(less())
        .pipe(gulp.dest('./public/css'));
});

gulp.task('watch', function() {
    gulp.watch('./less/*.less', ['less']);
});

var nodemonOptions = {
    script: 'bin/www',
    ext: 'js handlebars coffee',
    stdout: false
};

gulp.task('develop', function () {
    livereload.listen();
    nodemon(nodemonOptions).on('readable', function () {
        this.stdout.on('data', function (chunk) {
            if(/^Express server listening on port/.test(chunk)) {
                livereload.changed(__dirname);
            }
        });
        this.stdout.pipe(process.stdout);
        this.stderr.pipe(process.stderr);
    });
});

gulp.task('debug-option', function() {
    nodemonOptions.exec = 'node-inspector --no-preload & node --debug';
});

gulp.task('open-debug-tab', function() {
    gulp.src(__filename)
        .pipe(open({uri: 'http://127.0.0.1:8080/?ws=127.0.0.1:8080&port=5858'}));
});

gulp.task('components', [
    'webpack:components',
    'copy:components'
]);

gulp.task('build', [
    'less',
    'components'
]);

gulp.task('default', [
    'build',
    'develop',
    'watch'
]);

gulp.task('debug', [
    'debug-option',
    'default',
    'open-debug-tab'
]);
