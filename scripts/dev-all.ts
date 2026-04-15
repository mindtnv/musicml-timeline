#!/usr/bin/env bun
/**
 * Single launcher that boots all three services in parallel:
 *   - ml-api   (FastAPI / Python, port 8000)
 *   - backend  (Elysia / Bun,    port 3000)
 *   - frontend (Vite / React,    port 5173)
 *
 * Each child's stdout/stderr is prefixed with [service] so logs are readable.
 * Ctrl+C or SIGTERM gracefully shuts down all children.
 *
 * Used by preview_start "musicml" so the user can launch the full stack
 * with a single click.
 */

import { spawn, type Subprocess } from "bun";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

interface ServiceSpec {
  name: string;
  cwd: string;
  cmd: string[];
  color: string; // ANSI color for prefix
}

const isWindows = process.platform === "win32";
const pythonExe = isWindows
  ? join(ROOT, ".venv", "Scripts", "python.exe")
  : join(ROOT, ".venv", "bin", "python");

const services: ServiceSpec[] = [
  {
    name: "ml-api",
    cwd: ROOT,
    cmd: [
      pythonExe,
      "scripts/serve_ml.py",
      "--ckpt", "checkpoints/ast_v2/best.pt",
      "--config", "configs/ast.yaml",
      "--port", "8000",
    ],
    color: "\x1b[36m", // cyan
  },
  {
    name: "backend",
    cwd: join(ROOT, "web", "backend"),
    cmd: ["bun", "run", "dev"],
    color: "\x1b[33m", // yellow
  },
  {
    name: "frontend",
    cwd: join(ROOT, "web", "frontend"),
    cmd: ["bun", "run", "dev"],
    color: "\x1b[35m", // magenta
  },
];

const RESET = "\x1b[0m";

function prefixStream(stream: ReadableStream<Uint8Array> | null, label: string, color: string) {
  if (!stream) return;
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          process.stdout.write(`${color}[${label}]${RESET} ${line}\n`);
          nl = buffer.indexOf("\n");
        }
      }
      if (buffer) {
        process.stdout.write(`${color}[${label}]${RESET} ${buffer}\n`);
      }
    } catch {
      // stream closed — fine
    }
  })();
}

const procs: Subprocess[] = [];

function shutdown() {
  console.log("\n[dev-all] shutting down children...");
  for (const p of procs) {
    try { p.kill("SIGTERM"); } catch {}
  }
  // Hard-kill after 4s if any are stuck
  setTimeout(() => {
    for (const p of procs) {
      try { p.kill("SIGKILL"); } catch {}
    }
    process.exit(0);
  }, 4000).unref?.();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  for (const p of procs) {
    try { p.kill("SIGKILL"); } catch {}
  }
});

console.log("[dev-all] starting all services...\n");

for (const svc of services) {
  console.log(`${svc.color}[${svc.name}]${RESET} cwd=${svc.cwd}`);
  console.log(`${svc.color}[${svc.name}]${RESET} cmd=${svc.cmd.join(" ")}`);
  const p = spawn({
    cmd: svc.cmd,
    cwd: svc.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  procs.push(p);
  prefixStream(p.stdout, svc.name, svc.color);
  prefixStream(p.stderr, svc.name, svc.color);
  // If a child dies, take everyone with it.
  p.exited.then((code) => {
    console.log(
      `${svc.color}[${svc.name}]${RESET} exited with code ${code}`,
    );
    if (code !== 0 && code !== null) {
      console.error(`[dev-all] ${svc.name} crashed — stopping all`);
      shutdown();
    }
  });
}

// Keep parent alive forever (until signal)
await new Promise(() => {});
