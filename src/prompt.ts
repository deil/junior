import { readFileSync } from "node:fs";

const renderTemplate = (
	templatePath: string,
	placeholders: Record<string, string>,
): string => {
	const template = readFileSync(new URL(templatePath, import.meta.url), "utf8");
	let rendered = template;
	for (const [key, value] of Object.entries(placeholders)) {
		rendered = rendered.replaceAll(`{{ ${key} }}`, value);
	}
	return rendered;
};

export const getGenericPrompt = (progressFile: string): string =>
	renderTemplate("../prompts/beads-ready.md", {
		"progress-file": progressFile,
	});

export const getEpicPrompt = (
	epicId: string,
	progressFile: string,
): string =>
	renderTemplate("../prompts/beads-epic.md", {
		"epic-id": epicId,
		"progress-file": progressFile,
	});
