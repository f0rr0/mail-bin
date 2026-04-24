import { spawn } from "node:child_process";
import { once } from "node:events";

import { resolveWranglerConfigPath } from "./lib/wrangler-config";

const args = process.argv.slice(2);

if (args.length === 0) {
	throw new Error("Usage: bun run ./scripts/wrangler.ts <wrangler args...>");
}

const configPath = resolveWranglerConfigPath();
const child = spawn("bunx", ["wrangler", ...args, "--config", configPath], {
	env: {
		...process.env,
		WRANGLER_CONFIG: configPath,
	},
	stdio: "inherit",
});

const errorPromise = async () => {
	const [error] = await once(child, "error");
	throw error;
};
const exitPromise = async () => {
	const [code, signal] = await once(child, "exit");

	if (signal) {
		throw new Error(`wrangler exited with signal ${signal}`);
	}

	return code ?? 0;
};
const exitCode = await Promise.race([errorPromise(), exitPromise()]);

process.exit(exitCode);
