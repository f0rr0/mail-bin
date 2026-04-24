import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";

import {
	localWranglerConfigPath,
	readWranglerConfigOptionsFromEnv,
	writeWranglerConfig,
} from "./lib/wrangler-config";

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function run(command: string, args: string[]) {
	const child = spawn(command, args, {
		stdio: ["inherit", "pipe", "pipe"],
	});
	const outputChunks: Buffer[] = [];

	child.stdout.on("data", (chunk: Buffer) => {
		outputChunks.push(chunk);
		process.stdout.write(chunk);
	});

	child.stderr.on("data", (chunk: Buffer) => {
		outputChunks.push(chunk);
		process.stderr.write(chunk);
	});

	const errorPromise = async () => {
		const [error] = await once(child, "error");
		throw error;
	};
	const exitPromise = async () => {
		const [code, signal] = await once(child, "exit");
		const output = Buffer.concat(outputChunks).toString("utf-8");

		if (signal) {
			throw new Error(`${command} exited with signal ${signal}`);
		}

		if (code !== 0) {
			throw new Error(`${command} ${args.join(" ")} exited with code ${code}`);
		}

		return output;
	};

	return Promise.race([errorPromise(), exitPromise()]);
}

const options = readWranglerConfigOptionsFromEnv();
const workerName = options.workerName ?? "mail-bin";
const databaseName = options.databaseName ?? workerName;
const outFile = options.outFile ?? localWranglerConfigPath;
let { databaseId } = options;

if (!databaseId && existsSync(outFile)) {
	console.error(
		`${outFile} already exists. Reuse it as-is, delete it to create a new D1 database, or set MAIL_BIN_D1_DATABASE_ID to regenerate the config for an existing database.`,
	);
	process.exit(1);
}

if (!databaseId) {
	const output = await run("bunx", ["wrangler", "d1", "create", databaseName]);
	databaseId = output.match(uuidPattern)?.[0];
}

if (!databaseId) {
	throw new Error("Could not determine D1 database ID from Wrangler output.");
}

const result = await writeWranglerConfig({
	...options,
	appEnv: options.appEnv ?? "production",
	databaseId,
	databaseName,
	outFile,
	workerName,
});

console.log(`Wrote ${result.outFile}.`);
console.log("Next steps:");
console.log("  bun run cf:types");
console.log("  bun run db:migrate:remote");
console.log("  bun run deploy");
console.log("  bun run cf secret put CLOUDFLARE_API_TOKEN");
console.log("  bun run cf secret put CLOUDFLARE_ACCOUNT_ID");
console.log("  bun run cf secret put CLOUDFLARE_EMAIL_WORKER_NAME");
