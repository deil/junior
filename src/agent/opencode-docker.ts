import { spawn, spawnSync } from "node:child_process";
import {
	appendFileSync,
	accessSync,
	chmodSync,
	constants,
	existsSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import type { Agent, AgentConfig } from "./types.js";

const findExecutableInPath = (name: string): string | null => {
	const pathValue = process.env.PATH ?? "";
	for (const dir of pathValue.split(":")) {
		if (!dir) continue;
		const candidate = join(dir, name);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// ignore
		}
	}
	return null;
};

const ensureLinuxBd = (): string | null => {
	const arch =
		process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : "";
	if (!arch) return null;

	const cacheDir = join(homedir(), ".cache", "junior", "bd", `linux_${arch}`);
	const cacheBin = join(cacheDir, "bd");
	try {
		accessSync(cacheBin, constants.X_OK);
		return cacheBin;
	} catch {
		// continue
	}

	mkdirSync(cacheDir, { recursive: true });

	const tmpDir = mkdtempSync(join(tmpdir(), "junior-bd-"));
	const meta = spawnSync(
		"curl",
		[
			"-fsSL",
			"-H",
			"User-Agent: junior",
			"https://api.github.com/repos/steveyegge/beads/releases/latest",
		],
		{ encoding: "utf8" },
	);
	if (meta.status !== 0) return null;
	const match = /"tag_name"\s*:\s*"([^"]+)"/.exec(meta.stdout);
	if (!match) return null;
	const tag = match[1];
	const version = tag.startsWith("v") ? tag.slice(1) : tag;
	const archiveName = `beads_${version}_linux_${arch}.tar.gz`;
	const downloadUrl = `https://github.com/steveyegge/beads/releases/download/${tag}/${archiveName}`;
	const archivePath = join(tmpDir, archiveName);

	const download = spawnSync("curl", ["-fsSL", "-o", archivePath, downloadUrl]);
	if (download.status !== 0) return null;
	const untar = spawnSync("tar", ["-xzf", archivePath, "-C", tmpDir]);
	if (untar.status !== 0) return null;

	const extracted = join(tmpDir, "bd");
	if (!existsSync(extracted)) return null;
	renameSync(extracted, cacheBin);
	chmodSync(cacheBin, 0o755);
	return cacheBin;
};

export class OpenCodeInDockerAgent implements Agent {
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
			const cmd = "docker";
			const opencodeArgs = this.verbose
				? ["run", "-m", "opencode/grok-code", prompt]
				: ["run", "-m", "opencode/grok-code", prompt];
			const bdPath =
				process.platform === "linux"
					? findExecutableInPath("bd")
					: ensureLinuxBd();
			const hostBinMount = bdPath ? dirname(bdPath) : null;

			const args = [
				"run",
				"--rm",
				"-i",
				"-v",
				`${this.workdir}:/workspace`,
				"-w",
				"/workspace",
				"-e",
				'OPENCODE_PERMISSION={"*":"allow"}',
				"ghcr.io/anomalyco/opencode",
				...opencodeArgs,
			];
			if (hostBinMount) {
				args.splice(
					7,
					0,
					"-v",
					`${hostBinMount}:/host-bin:ro`,
					"-e",
					"PATH=/host-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				);
			} else {
				console.warn("bd not found in PATH; Docker agent may fail.");
			}

			const child = spawn(cmd, args, {
				stdio: ["ignore", "pipe", "pipe"],
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
