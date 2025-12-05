// app_api/models/db.js
const mongoose = require('mongoose');
const readLine = require('readline');

mongoose.set('strictQuery', false);

const dbURI = 'mongodb+srv://hwangtutu:1234@cluster0.j31ok6r.mongodb.net/Loc8r';

// ✅ connect 함수 정의
const connect = () => {
    mongoose.connect(dbURI);
};

// 연결 이벤트 로그
mongoose.connection.on('connected', () => {
    console.log(`Mongoose connected to ${dbURI}`);
});

mongoose.connection.on('error', (err) => {
    console.log(`Mongoose connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
    console.log('Mongoose disconnected');
});

const gracefulShutdown = (msg, callback) => {
    mongoose.connection.close(() => {
        console.log(`Mongoose disconnected through ${msg}`);
        callback();
    });
};

// (Windows) Ctrl+C(SIGINT) 보강
if (process.platform === 'win32') {
    const rl = readLine.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('SIGINT', () => {
        process.emit('SIGINT');
    });
}

// nodemon 재시작
process.once('SIGUSR2', () => {
    gracefulShutdown('nodemon restart', () => {
        process.kill(process.pid, 'SIGUSR2');
    });
});

// 앱 종료
process.on('SIGINT', () => {
    gracefulShutdown('app termination', () => {
        process.exit(0);
    });
});

// Heroku 등 종료
process.on('SIGTERM', () => {
    gracefulShutdown('Heroku app shutdown', () => {
        process.exit(0);
    });
});

// --- Review 서브도큐먼트 스키마 ---
const reviewSchema = new mongoose.Schema({
    author: { type: String, required: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    reviewText: { type: String, required: true },
    createdOn: { type: Date, default: Date.now }
});

// --- OpeningTimes 서브도큐먼트 스키마 ---
const openingTimeSchema = new mongoose.Schema({
    days: { type: String, required: true },
    opening: { type: String },
    closing: { type: String },
    closed: { type: Boolean, required: true, default: false }
});

// ✅ 모델 로드 (중복 제거)
require('./locations');
require('./users');

// ✅ 마지막에 1회 연결
connect();
