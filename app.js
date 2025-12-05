require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

const passport = require('passport');
require('./app_api/models/db');
require('./app_api/config/passport');

const apiRouter = require('./app_api/routes/index');
var usersRouter = require('./app_server/routes/users');

var app = express();

/**
 * CORS (중요)
 * - localhost 개발용 + Netlify 배포용 도메인을 허용
 * - Authorization 헤더(토큰) 포함 요청도 허용
 */
const cors = require('cors');
const allowedOrigins = [
  'http://localhost:4200',
  'https://neon-sable-30f7e3.netlify.app',
  'https://loc8rauth24-2021810076-gunsuhwang.netlify.app',
  'https://loc8rpwa2-2021810076.netlify.app'
];

const corsOptions = {
  origin: (origin, cb) => {
    // Postman, curl 같은 Origin 없는 요청은 허용
    if (!origin) return cb(null, true);
    return cb(null, allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  optionsSuccessStatus: 200
};

// API 경로에만 CORS 적용
app.use('/api', cors(corsOptions));
// Preflight OPTIONS 처리
app.options('/api/*', cors(corsOptions));

// view engine setup
app.set('views', path.join(__dirname, 'app_server', 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'app_public', 'build')));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, 'app_public')));

app.use('/users', usersRouter);
app.use('/api', apiRouter);

// Catch unauthorised errors
app.use((err, req, res, next) => {
  if (err && err.name === 'UnauthorizedError') {
    res.status(401).json({ message: err.name + ': ' + err.message });
  } else {
    next(err);
  }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
