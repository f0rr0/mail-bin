import { readdir, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

function unfoldHeader(value: string) {
	return value.replaceAll(/\r?\n[ \t]+/g, " ").trim();
}

function getHeader(rawEmail: string, name: string) {
	const pattern = new RegExp(`^${name}:([\\s\\S]*?)(?:\\r?\\n[^ \\t]|$)`, "im");
	const match = rawEmail.match(pattern);

	if (!match) {
		return null;
	}

	return unfoldHeader(match[1] ?? "");
}

function extractEmailAddress(value: string | null, label: string) {
	if (!value) {
		throw new Error(`Missing ${label} header in fixture.`);
	}

	const bracketMatch = value.match(/<([^>]+)>/);

	if (bracketMatch?.[1]) {
		return bracketMatch[1].trim().toLowerCase();
	}

	const plainMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

	if (!plainMatch?.[0]) {
		throw new Error(`Could not parse ${label} header value: ${value}`);
	}

	return plainMatch[0].trim().toLowerCase();
}

async function walkFixtures(target: string): Promise<string[]> {
	const entries = await readdir(target, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const fullPath = resolve(target, entry.name);

			if (entry.isDirectory()) {
				return walkFixtures(fullPath);
			}

			return extname(entry.name) === ".eml" ? [fullPath] : [];
		}),
	);

	return files.flat().toSorted();
}

async function replayFixture(filePath: string, baseUrl: string) {
	const rawEmail = await readFile(filePath, "utf-8");
	const from = extractEmailAddress(getHeader(rawEmail, "From"), "From");
	const to = extractEmailAddress(getHeader(rawEmail, "To"), "To");
	const endpoint = new URL("/cdn-cgi/handler/email", baseUrl);

	endpoint.searchParams.set("from", from);
	endpoint.searchParams.set("to", to);

	const response = await fetch(endpoint, {
		body: rawEmail,
		headers: {
			"content-type": "text/plain; charset=utf-8",
		},
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(
			`${basename(filePath)} failed with ${response.status}: ${await response.text()}`,
		);
	}

	console.log(`Replayed ${basename(filePath)} -> ${to}`);
}

async function main() {
	const [fixtureTarget, baseUrlArgument] = process.argv.slice(2);
	const baseUrl = baseUrlArgument ?? process.env.MAIL_BIN_DEV_URL ?? "http://127.0.0.1:8787";

	if (!fixtureTarget) {
		throw new Error(
			"Usage: bun run ./scripts/replay-mail-fixture.ts <file-or-directory> [baseUrl]",
		);
	}

	const absoluteTarget = resolve(process.cwd(), fixtureTarget);
	const fixturePaths =
		extname(absoluteTarget) === ".eml" ? [absoluteTarget] : await walkFixtures(absoluteTarget);

	if (fixturePaths.length === 0) {
		throw new Error(`No .eml fixtures found in ${absoluteTarget}`);
	}

	for (const filePath of fixturePaths) {
		await replayFixture(filePath, baseUrl);
	}
}

await main();
