#!/usr/bin/env npx tsx

import { execSync, spawn } from 'child_process';
import { resolve } from 'path';
import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'fs';

// Configuration
const MAX_ITERATIONS = 50;
const PROMPT = `read @AGENTS.md and follow @docs/agent/tasks.md to implement ready tasks. If there are in_progress leftovers, complete them first. `;

// Parse args
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const progressIdx = args.findIndex(a => a === '--progress' || a === '-p');
const progressArg = progressIdx !== -1 ? args[progressIdx + 1] : null;
const workdir = resolve(args.find(a => !a.startsWith('-') && a !== progressArg) || process.cwd());
const progressFile = progressArg ? resolve(workdir, progressArg) : null;

interface Task {
  id: string;
  title: string;
  status: string;
  [key: string]: unknown;
}

function getTasks(): Task[] {
  try {
    const output = execSync('bd list --json --type task --all', { encoding: 'utf-8', cwd: workdir });
    return JSON.parse(output);
  } catch (err) {
    console.error('Failed to get tasks:', (err as Error).message);
    return [];
  }
}

function readProgressFile(): string {
  if (!progressFile || !existsSync(progressFile)) return '';
  try {
    return readFileSync(progressFile, 'utf-8');
  } catch {
    return '';
  }
}

// Manual spinner
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: NodeJS.Timeout | null = null;
let spinnerText = '';

function startSpinner(text: string) {
  spinnerText = text;
  let i = 0;
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${spinnerFrames[i++ % spinnerFrames.length]} ${spinnerText}`);
  }, 80);
}

function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r\x1b[K'); // clear line
  }
}

function updateSpinnerText(text: string) {
  spinnerText = text;
}

let stopAfterIteration = false;

process.on('SIGINT', () => {
  if (stopAfterIteration) {
    stopSpinner();
    console.log('\n\nForce quit');
    process.exit(130);
  }
  stopAfterIteration = true;
  updateSpinnerText(`${spinnerText} (stopping after this iteration, Ctrl+C again to force quit)`);
});

const verboseLogFile = resolve(process.cwd(), 'opencode-stdout.txt');

function runOpencode(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    // In non-verbose mode, use setsid to detach from controlling terminal
    const cmd = verbose ? 'opencode' : 'setsid';
    const args = verbose ? ['run', '-m', 'opencode/grok-code', prompt] : ['--wait', 'opencode', 'run', '-m', 'opencode/grok-code', prompt];

    const child = spawn(cmd, args, {
      stdio: verbose ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      cwd: workdir,
      env: {
        ...process.env,
        OPENCODE_PERMISSION: '{"*":"allow"}'
      }
    });

    if (verbose) {
      // Write output to file only
      child.stdout?.on('data', (data) => {
        appendFileSync(verboseLogFile, data);
      });
      child.stderr?.on('data', (data) => {
        appendFileSync(verboseLogFile, data);
      });
    } else {
      // Drain streams to prevent backpressure
      child.stdout?.resume();
      child.stderr?.resume();
    }

    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

function getClosedTaskIds(tasks: Task[]): Set<string> {
  return new Set(tasks.filter(t => t.status === 'closed').map(t => t.id));
}

async function main(): Promise<void> {
  console.log('=== Ralph Wiggum Loop Started ===');
  console.log(`Working directory: ${workdir}`);
  if (progressFile) console.log(`Progress file: ${progressFile}`);
  if (verbose) {
    writeFileSync(verboseLogFile, '');
    console.log(`Verbose log: ${verboseLogFile}`);
  }
  console.log();

  // Snapshots before first iteration
  let prevTasks = getTasks();
  let prevClosedIds = getClosedTaskIds(prevTasks);
  let prevProgress = readProgressFile();

  const initialClosedCount = prevClosedIds.size;
  console.log(`Initial state: ${initialClosedCount} closed, ${prevTasks.length - initialClosedCount} remaining\n`);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    // Check exit condition before running
    const remainingBefore = prevTasks.filter(t => t.status !== 'closed').length;
    if (remainingBefore === 0) {
      console.log('No remaining tasks. Feature complete!');
      break;
    }

    // Run with spinner
    const iterText = `Iteration ${iteration}/${MAX_ITERATIONS}`;
    startSpinner(iterText);

    await runOpencode(PROMPT);

    stopSpinner();

    if (stopAfterIteration) {
      console.log('Stopped by user after iteration completed');
      break;
    }

    // Get updated state
    const tasks = getTasks();
    const closedIds = getClosedTaskIds(tasks);

    // Find newly completed tasks
    const newlyCompleted = tasks.filter(t => closedIds.has(t.id) && !prevClosedIds.has(t.id));
    const remaining = tasks.filter(t => t.status !== 'closed');

    // Output iteration summary
    console.log(`--- Iteration ${iteration} ---`);
    if (newlyCompleted.length > 0) {
      console.log(`Completed (${newlyCompleted.length}):`);
      newlyCompleted.forEach(t => console.log(`  ✓ ${t.title}`));
    } else {
      console.log('No tasks completed');
    }
    console.log(`Remaining: ${remaining.length}`);

    // Show progress file diff
    if (progressFile) {
      const currentProgress = readProgressFile();
      if (currentProgress.length > prevProgress.length) {
        const appended = currentProgress.slice(prevProgress.length).trim();
        if (appended) {
          console.log('\nProgress update:');
          console.log(appended);
        }
      }
      prevProgress = currentProgress;
    }

    console.log();

    // Update for next iteration
    prevTasks = tasks;
    prevClosedIds = closedIds;
  }

  console.log('=== Ralph Wiggum Loop Finished ===');
}

main().catch(console.error);
