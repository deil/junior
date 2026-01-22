export interface AgentConfig {
	workdir: string;
	verbose: boolean;
	logFile?: string;
}

export interface Agent {
	run(prompt: string): Promise<void>;
}
