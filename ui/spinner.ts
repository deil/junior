const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let interval: NodeJS.Timeout | null = null;
export let text = "";

export const start = (initialText: string) => {
	text = initialText;
	let i = 0;
	interval = setInterval(() => {
		process.stdout.write(`\r${frames[i++ % frames.length]} ${text}`);
	}, 80);
};

export const stop = () => {
	if (interval) {
		clearInterval(interval);
		interval = null;
		process.stdout.write("\r\x1b[K"); // clear line
	}
};

export const updateText = (newText: string) => {
	text = newText;
};
