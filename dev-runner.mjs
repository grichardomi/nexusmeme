/**
 * Dev runner — spawns `tsx server.ts` and auto-restarts on exit.
 * Ctrl+C stops everything immediately (SIGINT propagates to child naturally).
 */
import { spawn } from 'child_process';

let child = null;
let stopping = false;

function start() {
  if (stopping) return;
  console.log('\n[runner] Starting server...');
  child = spawn('node_modules/.bin/tsx', ['server.ts'], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    child = null;
    if (stopping) return;
    console.log(`[runner] Server exited (${code ?? 'signal'}), restarting in 1s...`);
    setTimeout(start, 1000);
  });
}

process.on('SIGINT', () => {
  stopping = true;
  console.log('\n[runner] Stopping...');
  // Child already receives SIGINT from the terminal; wait briefly then exit
  setTimeout(() => process.exit(0), 3000);
});

start();
