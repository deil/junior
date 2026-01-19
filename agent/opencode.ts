import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import type { Agent, AgentConfig } from "./types.js";

export class OpenCodeAgent implements Agent {
	private readonly workdir: string;
	private readonly verbose: boolean;
	private readonly logFile?: string;

	constructor(config: AgentConfig) {
		this.workdir = config.workdir;
		this.verbose = config.verbose;
		this.logFile = config.logFile;
	}

	run(prompt: string): Promise<void> {
		return new Promise((resolve) => {
			const cmd = this.verbose ? "opencode" : "setsid";
			const args = this.verbose
				? ["run", "-m", "opencode/grok-code", prompt]
				: ["--wait", "opencode", "run", "-m", "opencode/grok-code", prompt];

			const child = spawn(cmd, args, {
				stdio: ["ignore", "pipe", "pipe"],
				cwd: this.workdir,
				env: {
					...process.env,
					OPENCODE_PERMISSION: '{"*":"allow"}',
				},
			});

			if (this.verbose && this.logFile) {
				const logFile = this.logFile;
				child.stdout?.on("data", (data) => {
					appendFileSync(logFile, data);
				});
				child.stderr?.on("data", (data) => {
					appendFileSync(logFile, data);
				});
			} else {
				child.stdout?.resume();
				child.stderr?.resume();
			}

			child.on("close", () => resolve());
			child.on("error", () => resolve());
		});
	}
}
