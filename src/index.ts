#!/usr/bin/env npx tsx

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { program } from "commander";
import { OpenCodeAgent } from "./agent/opencode.js";
import { OpenCodeInDockerAgent } from "./agent/opencode-docker.js";
import { type IterationProgress, type LoopDelegate, runLoop } from "./loop.js";
import { getEpicPrompt, getGenericPrompt } from "./prompt.js";
import { BeadsTaskBackend } from "./tasks/beads.js";
import type { Task } from "./tasks/types.js";
import * as spinner from "./ui/spinner.js";

const MAX_ITERATIONS = 50;

program
	.argument("[directory]", "working directory", process.cwd())
	.option("-v, --verbose", "enable verbose logging")
	.option("-p, --progress <file>", "progress file path")
	.option("--epic <epic-id>", "run only tasks in the epic")
	.option("--docker", "run OpenCode in Docker")
	.parse();

const opts = program.opts<{
	verbose?: boolean;
	progress?: string;
	epic?: string;
	docker?: boolean;
}>();
const workdir = resolve(program.args[0] || process.cwd());
const verbose = opts.verbose ?? false;
const progressFile = opts.progress ? resolve(workdir, opts.progress) : null;
const progressFileName = opts.progress?.trim() || "progress.txt";
const epicId = opts.epic?.trim() || "";
const useDocker = opts.docker ?? false;

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

const verboseLogFile = resolve(process.cwd(), "temp/opencode-stdout.jsonl");

const agent = useDocker
	? new OpenCodeInDockerAgent({
			workdir,
			verbose,
			logFile: verboseLogFile,
		})
	: new OpenCodeAgent({
			workdir,
			verbose,
			logFile: verboseLogFile,
		});

const taskBackend = new BeadsTaskBackend(workdir);

const formatTask = (t: Task) => `${t.id} - ${t.title}`;

const delegate: LoopDelegate = {
	log(message) {
		console.log(message);
	},
	onPreflightUpdate(message, done) {
		const text = done ? `\r${message}\n\n` : message;
		process.stdout.write(text);
	},

	onIterationStart(iteration, maxIterations) {
		const iterationLabel = ` (iteration ${iteration}/${maxIterations})`;
		const text = verbose
			? `Working...${iterationLabel}`
			: "Working...";
		spinner.start(text);
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
			console.log("Task closed:");
			for (const t of newlyClosed) console.log(`  ✓ ${formatTask(t)}`);
		}

		if (newlyCreated.length > 0) {
			console.log(`Created (${newlyCreated.length}):`);
			for (const t of newlyCreated) console.log(`  + ${formatTask(t)}`);
		}

		if (newlyClosed.length === 0 && newlyCreated.length === 0) {
			console.log("No changes");
		}

		console.log(`Backlog: ${remaining.length} open tasks remaining`);
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
	console.log("=== Junior going to june ===\n");
	console.log("Context:");
	console.log(`  Working directory: ${workdir}`);
	if (progressFile) console.log(`  Progress file: ${progressFile}`);
	if (verbose) {
		writeFileSync(verboseLogFile, "");
		console.log(`  Verbose log: ${verboseLogFile}`);
	}
	console.log();
	console.log(`Mode: ${epicId ? `Epic ${epicId}` : "next available task"}`);
	console.log();

	const prompt = epicId
		? getEpicPrompt(epicId, progressFileName)
		: getGenericPrompt(progressFileName);
	if (verbose) {
		console.log("🐛 Agent instructions:");
		console.log(prompt);
		console.log();
	}

	await runLoop(
		{
			agent,
			taskBackend,
			prompt,
			maxIterations: MAX_ITERATIONS,
			readProgress: readProgressFile,
		},
		delegate,
	);

	console.log("=== Junior finished juning ===");
};

main().catch(console.error);
