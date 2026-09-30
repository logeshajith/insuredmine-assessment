const mongoose = require('mongoose');

async function connectDB(uri = process.env.MONGO_URI) {
  await mongoose.connect(uri);
  console.log(`[DB] Connected (pid ${process.pid})`);
}

module.exports = connectDB;