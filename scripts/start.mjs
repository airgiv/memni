// Production entry for a single container: the site and the worker side by side.
// If either stops, the container stops so the platform restarts it.
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "3000";
const procs = [
  spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit" }),
  spawn("npx", ["tsx", "worker/index.ts"], { stdio: "inherit" }),
];
const stop = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
procs.forEach((p) =>
  p.on("exit", (code) => {
    stop();
    process.exit(code ?? 1);
  }),
);
