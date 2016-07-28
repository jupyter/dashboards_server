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

// default to 'production' if not set
var NODE_ENV = process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() === 'development' ?
        'development' : 'production';

var webpackStatsOptions = {
    colors: gutil.colors.supportsColor,
    hash: false,
    timings: false,
    chunks: false,
    chunkModules: false,  // set this & above to `true` to see which modules are complied in
    modules: false,
    children: true,
    version: false,
    cached: false,
    cachedAssets: false,
    reasons: false,
    source: false,
    errorDetails: false
};

// base configuration
var webpackConfig = {
    bail: true,
    entry: {
        'dashboard': './client/js/dashboard.js'
    },
    module: {
        loaders: [
            { test: /\.css$/, loader: 'style-loader!css-loader' },
            { test: /\.json$/, loader: 'json-loader' },
            { test: /\.html$/, loader: 'file' },
            // jquery-ui loads some images
            { test: /\.(jpg|png|gif)$/, loader: "file" },
            // required to load font-awesome
            { test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/font-woff" },
            { test: /\.woff(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/font-woff" },
            { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=application/octet-stream" },
            { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, loader: "file" },
            { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/, loader: "url?limit=10000&mimetype=image/svg+xml" }
        ]
    },
    resolve: {
        modulesDirectories: ['client/js', 'node_modules']
    },
    plugins: [],
    output: {
        filename: '[name].js',
        path: './public/components',
        publicPath: '/components/'
    }
};

// add addition config options depending on development vs production build
if (NODE_ENV === 'production') {
    webpackConfig.plugins.push(
        new webpack.optimize.UglifyJsPlugin({
            minimize: true,
            compress: {
                warnings: false, // Suppress uglification warnings
            }
        })
    );
    webpackConfig.devtool = 'source-map';
} else {
    webpackConfig.debug = true;
}

gulp.task('webpack:components', function(done) {
    webpack(webpackConfig, function(err, stats) {
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
            ],
            dest: 'public/components'
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
    gulp.src('./client/less/style.less')
        .pipe(plumber())
        .pipe(less())
        .pipe(gulp.dest('./public/css'));
});

gulp.task('watch', function() {
    gulp.watch('./client/less/*.less', ['less']);
    gulp.watch('./client/js/*.js', ['webpack:components']);
});

var nodemonOptions = {
    script: 'bin/jupyter-dashboards-server',
    ext: 'js handlebars coffee',
    stdout: false,
    ignore: ['data/*']
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
    'develop',
    'watch'
]);

gulp.task('debug', [
    'debug-option',
    'default',
    'open-debug-tab'
]);
