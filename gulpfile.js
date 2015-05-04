var gulp = require('gulp');
var ts = require('gulp-typescript');
var del = require('del');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var sourcemaps = require('gulp-sourcemaps');
var runSequence = require('run-sequence');
var sloc = require('gulp-sloc');
var header = require('gulp-header');
var webserver = require('gulp-webserver');

// Options
var options = {
	header: "// Auto-generated file - do not modify!\n"
};

// Catching errors is necessary because otherwise it causes watch to stop (and the default error handling doesn't show any information about the error)
function logError(error) {
    console.log("Error occurred: " + error.toString());
    this.emit('end');
}

gulp.task('stats', function (cb) {
	gulp.src(['build/key-action-binder.js'])
		.pipe(sloc());
});

gulp.task('webserver', function (cb) {
	gulp.src('.')
	.pipe(webserver({
		livereload: true,
		directoryListing: true,
		open: true
	}));
});

gulp.task('clean', function (cb) {
	return del(['build/**/*'], cb);
});

gulp.task('build', function() {
	// TODO: use sortOutput:true in the future and move sourcemap generation to the TS parameters (tsconfig too?)
	return gulp.src('src/core/KeyActionBinder.ts')
		.pipe(sourcemaps.init())
		.pipe(ts({
			declarationFiles: false,
			noExternalResolve: false,
			removeComments: false,
			target: "es5",
			module: "amd",
			noImplicitAny: true,
			//sortOutput: true,
			typescript: require('typescript'),
			out: "key-action-binder.js",
		}))
		.pipe(header(options.header))
		.pipe(sourcemaps.write())
		.pipe(gulp.dest('build'));
});

gulp.task('minify', function () {
	return gulp.src('build/key-action-binder.js')
		.pipe(concat('key-action-binder.min.js'))
		.pipe(uglify()).on('error', logError)
		.pipe(header(options.header))
		.pipe(gulp.dest('build'));
});

gulp.task('rebuild', function() { 
	runSequence('clean', 'build', 'minify');
});

gulp.task('watch', ['rebuild'], function () {
	gulp.watch(['src/**/*.ts'], ['rebuild']);
});

gulp.task('default', ['watch']);
