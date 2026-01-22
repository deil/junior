export type TaskStatus = "ready" | "in_progress" | "closed";

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	[key: string]: unknown;
}

export interface TaskBackend {
	list(): Promise<Task[]>;
	getClosed(): Promise<Task[]>;
	setStatus(taskId: string, status: TaskStatus): Promise<void>;
}
