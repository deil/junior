#!/usr/bin/env npx tsx

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { program } from "commander";
import { OpenCodeAgent } from "./agent/opencode.js";
import {
	getOpenTaskCount,
	type IterationProgress,
	type LoopDelegate,
	runLoop,
} from "./loop.js";
import { PROMPT } from "./prompt.js";
import { BeadsTaskBackend } from "./tasks/beads.js";
import type { Task } from "./tasks/types.js";
import * as spinner from "./ui/spinner.js";

const MAX_ITERATIONS = 50;

program
	.argument("[directory]", "working directory", process.cwd())
	.option("-v, --verbose", "enable verbose logging")
	.option("-p, --progress <file>", "progress file path")
	.parse();

const opts = program.opts<{ verbose?: boolean; progress?: string }>();
const workdir = resolve(program.args[0] || process.cwd());
const verbose = opts.verbose ?? false;
const progressFile = opts.progress ? resolve(workdir, opts.progress) : null;

const readProgressFile = (): string => {
	if (!progressFile || !existsSync(progressFile)) return "";
	try {
		return readFileSync(progressFile, "utf-8");
	} catch {
		return "";
	}
};

let stopAfterIteration = false;

process.on("SIGINT", () => {
	if (stopAfterIteration) {
		spinner.stop();
		console.log("\n\nForce quit");
		process.exit(130);
	}
	stopAfterIteration = true;
	spinner.updateText(
		`${spinner.text} (stopping after this iteration, Ctrl+C again to force quit)`,
	);
});

const verboseLogFile = resolve(process.cwd(), "opencode-stdout.txt");

const agent = new OpenCodeAgent({
	workdir,
	verbose,
	logFile: verboseLogFile,
});

const taskBackend = new BeadsTaskBackend(workdir);

const formatTask = (t: Task) => `${t.id} - ${t.title}`;

const delegate: LoopDelegate = {
	onIterationStart(iteration, maxIterations) {
		spinner.start(`Iteration ${iteration}/${maxIterations}`);
	},

	onIterationAgentDone() {
		spinner.stop();
	},

	onIterationComplete(progress: IterationProgress) {
		const { iteration, newlyClosed, newlyCreated, remaining, agentLog } =
			progress;

		console.log(`--- Iteration ${iteration} ---`);

		if (agentLog) {
			console.log(agentLog);
			console.log();
		}

		if (newlyClosed.length > 0) {
			console.log(`Closed (${newlyClosed.length}):`);
			for (const t of newlyClosed) console.log(`  ✓ ${formatTask(t)}`);
		}

		if (newlyCreated.length > 0) {
			console.log(`Created (${newlyCreated.length}):`);
			for (const t of newlyCreated) console.log(`  + ${formatTask(t)}`);
		}

		if (newlyClosed.length === 0 && newlyCreated.length === 0) {
			console.log("No changes");
		}

		console.log(`Remaining: ${remaining.length}`);
		console.log();
	},

	onAllTasksComplete() {
		console.log("No remaining tasks. Feature complete!");
	},

	onUserStopped() {
		console.log("Stopped by user after iteration completed");
	},

	shouldStop() {
		return stopAfterIteration;
	},
};

const main = async (): Promise<void> => {
	console.log("=== Junior going to june ===");
	console.log(`Working directory: ${workdir}`);
	if (progressFile) console.log(`Progress file: ${progressFile}`);
	if (verbose) {
		writeFileSync(verboseLogFile, "");
		console.log(`Verbose log: ${verboseLogFile}`);
	}
	console.log();

	const openCount = await getOpenTaskCount(taskBackend);
	console.log(`${openCount} open tasks\n`);

	await runLoop(
		{
			agent,
			taskBackend,
			prompt: PROMPT,
			maxIterations: MAX_ITERATIONS,
			readProgress: readProgressFile,
		},
		delegate,
	);

	console.log("=== Junior finished juning ===");
};

main().catch(console.error);
