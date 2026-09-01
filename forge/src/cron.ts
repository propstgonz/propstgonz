import cron from "node-cron";
import { log, logError } from "./lib/log.js";
import { runPipeline } from "./pipeline.js";

const args = process.argv.slice(2);
const once = args.includes("--once");
const dryRun = args.includes("--dry-run");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg?.split("=")[1] as "languages" | "contributions" | undefined;

async function runOnce(): Promise<void> {
  const startedAt = Date.now();
  try {
    await runPipeline({ dryRun, only });
    log("cron", `pipeline finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  } catch (err) {
    logError("cron", "pipeline run failed", err);
    if (once) process.exitCode = 1;
  }
}

if (once) {
  await runOnce();
} else {
  const schedule = process.env["CRON_SCHEDULE"] ?? "0 4 * * *";
  log("cron", `scheduling pipeline at "${schedule}" (${process.env["TZ"] ?? "system tz"})`);
  cron.schedule(schedule, () => void runOnce());
  // Run once at startup so a fresh deploy doesn't wait a full day for first data.
  void runOnce();
}
