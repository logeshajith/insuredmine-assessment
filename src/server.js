require('dotenv').config({ quiet: true });
const cluster = require('cluster');
const os = require('os');

const WORKERS = parseInt(process.env.WORKERS, 10) || os.availableParallelism();

if (cluster.isPrimary) {
  runPrimary();
} else {
  runWorker();
}

// ---------------- PRIMARY (manager) ----------------
function runPrimary() {
  console.log(`[Primary ${process.pid}] Starting ${WORKERS} workers`);

  let restartingId = null;   // only one worker may restart at a time
  let shuttingDown = false;  // true when we stop the whole app (Ctrl + C)
  const startTimes = new Map();

  const fork = () => {
    const worker = cluster.fork();
    startTimes.set(worker.id, Date.now());

    // A worker asks for permission to restart
    worker.on('message', (msg) => {
      if (!msg || msg.type !== 'cpu-high') return;

      if (restartingId === null) {
        restartingId = worker.id;
        console.warn(`[Primary] Approved restart of worker ${worker.process.pid} (CPU ${msg.percent}%)`);
        worker.send({ type: 'restart-approved' });
      } else {
        console.warn(`[Primary] Worker ${worker.process.pid} wants restart, but another restart is in progress. Denied for now.`);
        worker.send({ type: 'restart-denied' });
      }
    });
  };

  for (let i = 0; i < WORKERS; i++) fork();

  // When a worker exits, start a new one
  cluster.on('exit', (worker, code, signal) => {
    if (restartingId === worker.id) restartingId = null;
    if (shuttingDown) return;

    const livedMs = Date.now() - (startTimes.get(worker.id) || 0);
    startTimes.delete(worker.id);

    // If it died very quickly (e.g. DB down), wait before retrying to avoid a crash loop
    const delay = livedMs < 5000 ? 5000 : 0;
    console.warn(
      `[Primary] Worker ${worker.process.pid} exited (code ${code}${signal ? ', ' + signal : ''}). ` +
      `Starting a new worker${delay ? ' in 5s' : ''}...`
    );
    setTimeout(fork, delay);
  });

  // Stop everything cleanly on Ctrl + C
  const stopAll = () => {
    shuttingDown = true;
    for (const id in cluster.workers) cluster.workers[id].kill();
    process.exit(0);
  };
  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);
}

// ---------------- WORKER (handles requests) ----------------
function runWorker() {
  const mongoose = require('mongoose');
  const app = require('./app');
  const connectDB = require('./config/db');
  const { startCpuMonitor } = require('./services/cpuMonitor');

  const PORT = process.env.PORT || 3000;

  (async () => {
    try {
      await connectDB();
    } catch (err) {
      console.error(`[Worker ${process.pid}] DB connection failed:`, err.message);
      process.exit(1);
    }

    const server = app.listen(PORT, () => {
      console.log(`[Worker ${process.pid}] Listening on http://localhost:${PORT}`);
    });

    // Graceful shutdown: stop new requests, finish current ones, close DB, then exit
    let closing = false;
    const shutdown = (reason) => {
      if (closing) return;
      closing = true;
      console.warn(`[Worker ${process.pid}] Graceful shutdown: ${reason}`);

      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
      server.closeIdleConnections?.(); // close idle keep-alive connections

      // Safety: force exit if something hangs
      setTimeout(() => process.exit(1), 10000).unref();
    };

    startCpuMonitor({
      threshold: Number(process.env.CPU_THRESHOLD) || 70,
      intervalMs: Number(process.env.CPU_CHECK_INTERVAL_MS) || 5000,
      strikes: Number(process.env.CPU_STRIKES) || 3,
      warmupMs: Number(process.env.CPU_WARMUP_MS) || 30000,
      onHigh: (percent, reset) => {
        // Ask the primary for permission to restart
        process.send({ type: 'cpu-high', percent: percent.toFixed(1) });

        const onReply = (msg) => {
          if (msg?.type === 'restart-approved') {
            process.off('message', onReply);
            shutdown(`CPU ${percent.toFixed(1)}% above threshold`);
          } else if (msg?.type === 'restart-denied') {
            process.off('message', onReply);
            reset(); // try again later
          }
        };
        process.on('message', onReply);
      },
    });

    process.on('SIGTERM', () => shutdown('SIGTERM'));
  })();
}