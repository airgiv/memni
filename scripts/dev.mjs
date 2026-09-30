// Starts the Next.js dev server and the background worker together.
import { spawn } from "node:child_process";

const procs = [
  spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit" }),
  spawn("npx", ["tsx", "watch", "--clear-screen=false", "worker/index.ts"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) => p.on("exit", (code) => { stop(); process.exitCode = code ?? 0; }));
