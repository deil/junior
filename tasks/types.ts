export interface Task {
	id: string;
	title: string;
	status: string;
	[key: string]: unknown;
}

export interface TaskBackend {
	list(): Promise<Task[]>;
	getClosed(): Promise<Task[]>;
}
