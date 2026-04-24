import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import worker from "@/index";
import { testAssetFetcher } from "./helpers/fetcher";
import { ensureSchema, resetDatabase } from "./helpers/db";

async function dispatch(request: Request) {
	const ctx = createExecutionContext();
	const response = await worker.fetch(
		request,
		{
			...env,
			APP_ENV: "test",
			APP_NAME: "Mail Bin",
			ASSETS: testAssetFetcher,
		},
		ctx,
	);

	await waitOnExecutionContext(ctx);

	return response;
}

describe("http api", () => {
	beforeAll(ensureSchema);
	beforeEach(resetDatabase);

	it("serves health checks", async () => {
		const response = await dispatch(new Request("https://example.com/health"));
		const payload = (await response.json()) as {
			ok: boolean;
			name: string;
			environment: string;
		};

		expect(response.status).toBe(200);
		expect(payload.ok).toBeTruthy();
		expect(payload.name).toBe("Mail Bin");
		expect(payload.environment).toBe("test");
	});

	it("validates request payloads and returns created records", async () => {
		const invalidResponse = await dispatch(
			new Request("https://example.com/api/domains", {
				body: JSON.stringify({
					fqdn: "drop.example.com",
				}),
				headers: {
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);

		expect(invalidResponse.status).toBe(400);

		const destinationResponse = await dispatch(
			new Request("https://example.com/api/destinations", {
				body: JSON.stringify({
					email: "primary@example.com",
					label: "Primary",
					enabled: true,
				}),
				headers: {
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);
		const destination = (await destinationResponse.json()) as {
			id: string;
			verificationStatus: string;
		};

		expect(destinationResponse.status).toBe(200);
		expect(destination.verificationStatus).toBe("pending");

		const domainResponse = await dispatch(
			new Request("https://example.com/api/domains", {
				body: JSON.stringify({
					fqdn: "drop.example.com",
					zoneId: "zone-http",
					status: "pending",
					defaultDestinationIds: [destination.id],
				}),
				headers: {
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);
		const domain = (await domainResponse.json()) as { id: string };

		expect(domainResponse.status).toBe(200);

		const aliasResponse = await dispatch(
			new Request("https://example.com/api/aliases", {
				body: JSON.stringify({
					domainId: domain.id,
					localPart: "notion",
					label: "Notion",
					active: true,
					routingMode: "domain_default",
					overrideDestinationIds: [],
				}),
				headers: {
					"content-type": "application/json",
				},
				method: "POST",
			}),
		);
		const alias = (await aliasResponse.json()) as {
			active: boolean;
			effectiveDestinations: unknown[];
		};

		expect(aliasResponse.status).toBe(200);
		expect(alias.active).toBeFalsy();
		expect(alias.effectiveDestinations).toHaveLength(0);

		const domainsResponse = await dispatch(new Request("https://example.com/api/domains"));
		const domains = (await domainsResponse.json()) as {
			fqdn: string;
			defaultDestinations: unknown[];
		}[];

		expect(domains).toHaveLength(1);
		expect(domains[0]?.fqdn).toBe("drop.example.com");
		expect(domains[0]?.defaultDestinations).toHaveLength(1);
	});
});
