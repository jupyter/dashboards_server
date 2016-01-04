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
    browserify = require('browserify'),
    source = require('vinyl-source-stream'),
    merge = require('merge-stream');

// browserify & copy components to `public/components`
gulp.task('browserify:components', function() {
    var components = [
        'jupyter-js-services',
        'jupyter-js-output-area'
    ];

    var tasks = components.map(function(compName) {
        return browserify({
                standalone: compName
            })
            .require(compName)
            .bundle()
            //Pass desired output filename to vinyl-source-stream
            .pipe(source(compName + '.js'))
            // Start piping stream to tasks!
            .pipe(gulp.dest('./public/components'));
    });

    return merge(tasks);
});

// XXX This tries to combine jupyter components into 1 file, but doesn't seem to fully work --
//     resulting file only seems to contain exports for `services` but not for `output-area`
// gulp.task('browserify:components', function() {
//     return browserify({
//             standalone: 'jupyter'
//         })
//         .require('jupyter-js-services')
//         .require('jupyter-js-output-area')
//         .bundle()
//         //Pass desired output filename to vinyl-source-stream
//         .pipe(source('jupyter.js'))
//         // Start piping stream to tasks!
//         .pipe(gulp.dest('./public/components'));
// });

// gulp.task('browserify:js', ['components'], function() {
//     return browserify('./public/js/main.js')
//         .external('./public/components/jupyter-modules.js')
//         .bundle()
//         //Pass desired output filename to vinyl-source-stream
//         .pipe(source('app.js'))
//         // Start piping stream to tasks!
//         .pipe(gulp.dest('./public/js'));
// });

// copy source into `public/components`
gulp.task('copy:components', ['browserify:components'], function() {
    var c1 = gulp.src([
            './node_modules/requirejs/require.js',
            './bower_components/gridstack/dist/gridstack.min.js',
            './bower_components/gridstack/dist/gridstack.min.css',
            './bower_components/jquery/dist/jquery.min.js',
            './bower_components/jquery-ui/jquery-ui.min.js',
            './bower_components/lodash/lodash.min.js'
        ])
        .pipe(gulp.dest('./public/components'));
    var c2 = gulp.src([
            './bower_components/jquery-ui/ui/minified/core.min.js',
            './bower_components/jquery-ui/ui/minified/mouse.min.js',
            './bower_components/jquery-ui/ui/minified/widget.min.js',
            './bower_components/jquery-ui/ui/minified/resizable.min.js',
            './bower_components/jquery-ui/ui/minified/draggable.min.js'
        ]).pipe(gulp.dest('./public/components/jquery-ui'));
    return merge(c1, c2);
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
    'browserify:components',
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
