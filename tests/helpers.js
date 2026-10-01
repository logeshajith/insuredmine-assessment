require('dotenv').config({ quiet: true });

// Always use the TEST database, never the real one
process.env.MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/insuredmine_test';

const mongoose = require('mongoose');

const connect = async () => {
  // Fail fast (5s) with the real reason, instead of waiting silently
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
};

const disconnect = async () => {
  // Only clean up if we actually connected
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Repeats check() until it returns true, or fails after the timeout
async function waitFor(check, timeout = 5000, interval = 100) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(interval);
  }
  throw new Error('waitFor timed out');
}

module.exports = { connect, disconnect, sleep, waitFor };