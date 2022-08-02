const { setTimeout } = require('timers/promises');

exports.initAttempts = 5;

const random = exports.random = (min = 0, max = 1) => Math.floor(Math.random() * (max - min) + min);
exports.randomSleep = () => setTimeout(random(5, 15));
