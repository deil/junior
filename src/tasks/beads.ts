import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Task, TaskBackend, TaskStatus } from "./types.js";

const execAsync = promisify(exec);

export class BeadsTaskBackend implements TaskBackend {
	constructor(private readonly workdir: string) {}

	async list(): Promise<Task[]> {
		try {
			const { stdout } = await execAsync("bd list --json --type task --all", {
				cwd: this.workdir,
			});
			return JSON.parse(stdout);
		} catch (err) {
			console.error("Failed to get tasks:", (err as Error).message);
			return [];
		}
	}

	async getClosed(): Promise<Task[]> {
		const tasks = await this.list();
		return tasks.filter((t) => t.status === "closed");
	}

	async setStatus(taskId: string, status: TaskStatus): Promise<void> {
		await execAsync(`bd update ${taskId} --status ${status}`, {
			cwd: this.workdir,
		});
	}
}
