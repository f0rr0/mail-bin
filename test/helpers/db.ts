import { env } from "cloudflare:workers";
import migrationSql from "../../drizzle/0000_initial.sql?raw";

let schemaReady = false;

const migrationStatements = migrationSql
	.split(/;\s*\n+/)
	.map((statement) => statement.trim())
	.filter(Boolean)
	.map((statement) => `${statement};`);

export async function ensureSchema() {
	if (schemaReady) {
		return;
	}

	await env.DB.batch(migrationStatements.map((statement) => env.DB.prepare(statement)));
	schemaReady = true;
}

export async function resetDatabase() {
	await ensureSchema();
	await env.DB.batch([
		env.DB.prepare("DELETE FROM delivery_attempts;"),
		env.DB.prepare("DELETE FROM delivery_events;"),
		env.DB.prepare("DELETE FROM alias_override_destinations;"),
		env.DB.prepare("DELETE FROM aliases;"),
		env.DB.prepare("DELETE FROM domain_default_destinations;"),
		env.DB.prepare("DELETE FROM destinations;"),
		env.DB.prepare("DELETE FROM domains;"),
	]);
}
