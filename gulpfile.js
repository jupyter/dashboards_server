/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
var gulp = require('gulp'),
    nodemon = require('gulp-nodemon'),
    plumber = require('gulp-plumber'),
    less = require('gulp-less'),
    open = require('gulp-open'),
    webpack = require('webpack'),
    gutil = require('gulp-util'),
    merge = require('merge-stream'),
    expect = require('gulp-expect-file');

var webpackStatsOptions = {
    colors: gutil.colors.supportsColor,
    hash: false,
    timings: false,
    chunks: false,
    chunkModules: false,
    modules: false,
    children: true,
    version: false,
    cached: false,
    cachedAssets: false,
    reasons: false,
    source: false,
    errorDetails: false
};

gulp.task('webpack:components', function(done) {
    webpack({
            entry: {
                'jupyter-js-output-area': './node_modules/jupyter-js-notebook/lib/output-area/index.js',
                'jupyter-js-services': './node_modules/jupyter-js-services/lib/index.js',
                'jupyter-js-widgets': './node_modules/jupyter-js-widgets/src/index.js',
                'urth-widgets': './node_modules/urth-widgets/index.js'
            },
            module: {
                loaders: [
                    { test: /\.css$/, loader: 'style-loader!css-loader' },
                    { test: /\.json$/, loader: 'json-loader' }
                ],

                // NOTE: This is required when building `widgets` from src
                // Disable handling of unknown requires
                unknownContextRegExp: /$^/,
                unknownContextCritical: false
            },
            externals: [
                'jquery',
                'jupyter-js-output-area',
                'jupyter-js-services',
                'jupyter-js-widgets',
                {
                    'requirejs': 'require' // loaded from `-services`
                }
            ],
            output: {
                libraryTarget: 'amd',
                filename: '[name].js',
                path: './public/components'
            },
        }, function(err, stats) {
            if (err) {
                throw new gutil.PluginError('webpack', err);
            }
            gutil.log("[webpack]", stats.toString(webpackStatsOptions));
            if (stats.hasErrors && stats.toJson().errors.length) {
                done(new Error('during webpack compilation'));
            } else {
                done();
            }
        });
});

// copy source into `public/components`
gulp.task('copy:components', function() {
    var tasks = [
        {
            files: [
                'node_modules/requirejs/require.js',
                'node_modules/jupyter-js-widgets/css/widgets.min.css',
                'bower_components/gridstack/dist/gridstack.min.js',
                'bower_components/gridstack/dist/gridstack.min.css',
                'bower_components/jquery/dist/jquery.min.js',
                'bower_components/jquery-ui/jquery-ui.min.js',
                'bower_components/lodash/dist/lodash.min.js'
            ],
            dest: 'public/components'
        },
        {
            files: [
                'bower_components/jquery-ui/ui/minified/core.min.js',
                'bower_components/jquery-ui/ui/minified/mouse.min.js',
                'bower_components/jquery-ui/ui/minified/widget.min.js',
                'bower_components/jquery-ui/ui/minified/resizable.min.js',
                'bower_components/jquery-ui/ui/minified/draggable.min.js',
                'bower_components/jquery-ui/themes/smoothness/jquery-ui.min.css',
            ],
            dest: 'public/components/jquery-ui'
        },
        {
            files: [
                'bower_components/jquery-ui/themes/smoothness/images/**/*'
            ],
            dest: 'public/components/jquery-ui/images'
        },
        {
            files: [
                'node_modules/urth-widgets/dist/urth/widgets/ext/notebook/bower_components/**/*'
            ],
            dest: 'public/urth_components'
        },
        {
            files: [
                'node_modules/font-awesome/fonts/*'
            ],
            dest: 'public/components/fonts'
        }
    ]
    .map(function(list) {
        return gulp.src(list.files)
            .pipe(expect({ errorOnFailure: true }, list.files))
            .pipe(gulp.dest(list.dest));
    });
    return merge.apply(this, tasks);
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

gulp.task('develop', ['build'], function () {
    nodemon(nodemonOptions).on('readable', function () {
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
