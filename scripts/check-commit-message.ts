import { existsSync, readFileSync } from "node:fs";

const allowedTypes = [
	"build",
	"chore",
	"ci",
	"docs",
	"feat",
	"fix",
	"perf",
	"refactor",
	"revert",
	"style",
	"test",
] as const;

const conventionalSubjectPattern = new RegExp(
	`^(${allowedTypes.join("|")})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: .+$`,
);

const ignoredSubjectPatterns = [/^Merge /, /^Revert "/, /^fixup! /, /^squash! /];
const maxSubjectLength = 100;

function readMessage(args: string[]) {
	if (args.length === 0) {
		throw new Error("Usage: bun run commitlint -- <commit-message-or-file>");
	}

	const [firstArg] = args;

	if (args.length === 1 && firstArg && existsSync(firstArg)) {
		return readFileSync(firstArg, "utf-8");
	}

	return args.join(" ");
}

function getSubject(message: string) {
	return (
		message
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0 && !line.startsWith("#")) ?? ""
	);
}

function fail(subject: string) {
	const examples = [
		"feat: add alias search",
		"fix(api): reject disabled aliases",
		"docs: clarify Cloudflare setup",
	];

	console.error("Invalid commit subject.");
	console.error(`Received: ${subject || "<empty>"}`);
	console.error("");
	console.error("Use Conventional Commits:");
	console.error(`  ${allowedTypes.join("|")}[optional-scope]: short summary`);
	console.error("");
	console.error("Examples:");
	for (const example of examples) {
		console.error(`  ${example}`);
	}

	process.exit(1);
}

const subject = getSubject(readMessage(process.argv.slice(2)));

if (ignoredSubjectPatterns.some((pattern) => pattern.test(subject))) {
	process.exit(0);
}

if (subject.length > maxSubjectLength || !conventionalSubjectPattern.test(subject)) {
	fail(subject);
}
