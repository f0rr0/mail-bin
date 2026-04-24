import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb } from "@/server/db";
import { createDomain, listDestinations, listDomains } from "@/server/data/service";
import { syncCloudflareState } from "@/server/sync/cloudflare";
import { testAssetFetcher } from "./helpers/fetcher";
import { ensureSchema, resetDatabase } from "./helpers/db";

function getRequestUrl(input: string | URL | Request) {
	if (typeof input === "string") {
		return input;
	}

	if (input instanceof Request) {
		return input.url;
	}

	return input.toString();
}

describe("cloudflare sync", () => {
	const db = getDb(env);

	beforeAll(ensureSchema);
	beforeEach(resetDatabase);
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("imports destination verification and reconciles catch-all state", async () => {
		await createDomain(db, {
			defaultDestinationIds: [],
			fqdn: "drop.example.com",
			status: "pending",
			zoneId: "zone-sync",
		});

		vi.stubGlobal(
			"fetch",
			vi.fn((input: string | URL | Request, init?: RequestInit) => {
				const url = new URL(getRequestUrl(input));

				if (url.pathname === "/client/v4/accounts/account-sync/email/routing/addresses") {
					return Response.json({
						result: [
							{
								id: "cf-destination-1",
								email: "primary@example.com",
								verified: "2026-04-19T00:00:00.000Z",
							},
						],
						success: true,
					});
				}

				if (url.pathname === "/client/v4/zones/zone-sync/email/routing") {
					return Response.json({
						result: {
							enabled: true,
							status: "ready",
						},
						success: true,
					});
				}

				if (url.pathname === "/client/v4/zones/zone-sync/email/routing/rules/catch_all") {
					if (init?.method === "PUT") {
						return Response.json({
							result: {
								actions: [
									{
										type: "worker",
										value: ["mail-bin-worker"],
									},
								],
								enabled: true,
							},
							success: true,
						});
					}

					return Response.json({
						result: {
							actions: [],
							enabled: false,
						},
						success: true,
					});
				}

				throw new Error(`Unexpected Cloudflare API request: ${url.toString()}`);
			}),
		);

		const summary = await syncCloudflareState({
			...env,
			APP_ENV: "test",
			APP_NAME: "Mail Bin",
			ASSETS: testAssetFetcher,
			CLOUDFLARE_ACCOUNT_ID: "account-sync",
			CLOUDFLARE_API_TOKEN: "token-sync",
			CLOUDFLARE_EMAIL_WORKER_NAME: "mail-bin-worker",
		});

		expect(summary.syncedDestinations).toBe(1);
		expect(summary.syncedDomains).toBe(1);
		expect(summary.domains[0]).toStrictEqual({
			catchAllAction: "worker",
			fqdn: "drop.example.com",
			routingEnabled: true,
			status: "active",
		});

		const [destination] = await listDestinations(db);
		expect(destination.email).toBe("primary@example.com");
		expect(destination.verificationStatus).toBe("verified");

		const [domain] = await listDomains(db);
		expect(domain.status).toBe("active");
	});
});
