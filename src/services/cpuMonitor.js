// Measures CPU usage of THIS process (one worker) and calls onHigh
// when usage stays above the threshold for several checks in a row.
function startCpuMonitor({ threshold = 70, intervalMs = 5000, strikes = 3, warmupMs = 30000, onHigh }) {
  const startedAt = Date.now();
  let prevUsage = process.cpuUsage();
  let prevTime = process.hrtime.bigint();
  let highCount = 0;
  let waiting = false; // true while waiting for the primary's answer

  const timer = setInterval(() => {
    // CPU time used since the last check (microseconds)
    const usage = process.cpuUsage(prevUsage);
    const now = process.hrtime.bigint();
    const elapsedMicros = Number(now - prevTime) / 1000;
    prevUsage = process.cpuUsage();
    prevTime = now;

    const percent = ((usage.user + usage.system) / elapsedMicros) * 100;

    if (process.env.CPU_LOG === 'true') {
      console.log(`[CPU] Worker ${process.pid}: ${percent.toFixed(1)}%`);
    }

    // Skip checks during warm-up, or while waiting for approval
    if (Date.now() - startedAt < warmupMs || waiting) return;

    if (percent > threshold) {
      highCount++;
      console.warn(`[CPU] Worker ${process.pid} above ${threshold}% (${highCount}/${strikes})`);
    } else {
      highCount = 0; // back to normal, reset the count
    }

    if (highCount >= strikes) {
      waiting = true;
      // reset() is called if the primary says "not now"
      onHigh(percent, () => {
        waiting = false;
        highCount = 0;
      });
    }
  }, intervalMs);

  timer.unref(); // don't keep the process alive just for this timer
  return { stop: () => clearInterval(timer) };
}

module.exports = { startCpuMonitor };