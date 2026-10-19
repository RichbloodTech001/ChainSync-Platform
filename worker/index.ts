import { assertRuntimeEnv } from "../lib/env";
import { errorMessage, log } from "../lib/log";
import { runMonitoringCycle } from "../lib/monitor";

/**
 * ChainSync monitoring worker. Runs the monitoring cycle on an interval:
 * scheduled network checks, watched-address indexing and alert delivery.
 *
 * Start with `npm run worker` (compose service `worker`, live-reloaded by tsx).
 * Configure the cadence with MONITOR_INTERVAL_MS (default 30000; minimum 5000).
 */
const intervalMs = Math.max(5_000, Number(process.env.MONITOR_INTERVAL_MS ?? 30_000));

let running = false;
let stopped = false;

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    await runMonitoringCycle();
  } catch (error) {
    log("error", "worker.cycle_failed", { error: errorMessage(error) });
  } finally {
    running = false;
  }
}

async function main() {
  const config = assertRuntimeEnv();
  log("info", "worker.start", {
    intervalMs,
    emailProvider: config.emailProvider,
    rpc: config.rpc,
  });

  await tick();
  // Keep the reference: without it the event loop empties after the first tick
  // and the process exits while the interval silently stops firing.
  const timer = setInterval(() => void tick(), intervalMs);

  const shutdown = (signal: string) => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    log("info", "worker.stop", { signal });
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main().catch((error) => {
  log("error", "worker.fatal", { error: errorMessage(error) });
  process.exit(1);
});
