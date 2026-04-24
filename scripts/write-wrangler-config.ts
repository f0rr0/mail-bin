import {
	generatedWranglerConfigPath,
	readWranglerConfigOptionsFromEnv,
	writeWranglerConfig,
} from "./lib/wrangler-config";

const [outFileArgument] = process.argv.slice(2);
const options = readWranglerConfigOptionsFromEnv();
const result = await writeWranglerConfig({
	...options,
	outFile: outFileArgument ?? options.outFile ?? generatedWranglerConfigPath,
});

console.log(`Wrote ${result.outFile} for Worker ${result.workerName}.`);

if (!result.databaseId) {
	console.log(
		"No MAIL_BIN_D1_DATABASE_ID was provided; Wrangler may auto-provision D1 on deploy, but remote migrations require a concrete database ID.",
	);
}
