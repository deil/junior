import type { Agent } from "./agent/types.js";
import type { Task, TaskBackend } from "./tasks/types.js";

export interface IterationProgress {
	iteration: number;
	newlyClosed: Task[];
	newlyCreated: Task[];
	remaining: Task[];
	agentLog: string | null;
}

export interface LoopDelegate {
	onIterationStart(iteration: number, maxIterations: number): void;
	onIterationAgentDone(): void;
	onIterationComplete(progress: IterationProgress): void;
	onAllTasksComplete(): void;
	onUserStopped(): void;
	shouldStop(): boolean;
}

export interface LoopConfig {
	agent: Agent;
	taskBackend: TaskBackend;
	prompt: string;
	maxIterations: number;
	readProgress: () => string;
}

export const runLoop = async (
	config: LoopConfig,
	delegate: LoopDelegate,
): Promise<void> => {
	const { agent, taskBackend, prompt, maxIterations, readProgress } = config;

	let prevTasks = await taskBackend.list();
	let prevClosed = await taskBackend.getClosed();
	let prevProgress = readProgress();

	const openCount = prevTasks.length - prevClosed.length;
	if (openCount === 0) {
		delegate.onAllTasksComplete();
		return;
	}

	for (let iteration = 1; iteration <= maxIterations; iteration++) {
		const remainingBefore = prevTasks.filter(
			(t) => t.status !== "closed",
		).length;
		if (remainingBefore === 0) {
			delegate.onAllTasksComplete();
			break;
		}

		delegate.onIterationStart(iteration, maxIterations);

		await agent.run(prompt);

		delegate.onIterationAgentDone();

		if (delegate.shouldStop()) {
			delegate.onUserStopped();
			break;
		}

		const tasks = await taskBackend.list();
		const closed = await taskBackend.getClosed();
		const currentProgress = readProgress();

		const prevTaskIds = new Set(prevTasks.map((t) => t.id));
		const prevClosedIds = new Set(prevClosed.map((t) => t.id));

		const newlyCreated = tasks.filter((t) => !prevTaskIds.has(t.id));
		const newlyClosed = closed.filter((t) => !prevClosedIds.has(t.id));
		const remaining = tasks.filter((t) => t.status !== "closed");

		let agentLog: string | null = null;
		if (currentProgress.length > prevProgress.length) {
			const appended = currentProgress.slice(prevProgress.length).trim();
			if (appended) agentLog = appended;
		}

		delegate.onIterationComplete({
			iteration,
			newlyClosed,
			newlyCreated,
			remaining,
			agentLog,
		});

		prevProgress = currentProgress;
		prevTasks = tasks;
		prevClosed = closed;
	}
};

export const getOpenTaskCount = async (
	taskBackend: TaskBackend,
): Promise<number> => {
	const tasks = await taskBackend.list();
	const closed = await taskBackend.getClosed();
	return tasks.length - closed.length;
};
