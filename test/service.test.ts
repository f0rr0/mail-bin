import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/server/db";
import {
	createAlias,
	createDestinationRecord,
	createDomain,
	findAliasRoutingSnapshot,
} from "@/server/data/service";
import { ensureSchema, resetDatabase } from "./helpers/db";

describe("routing service", () => {
	const db = getDb(env);

	beforeAll(ensureSchema);
	beforeEach(resetDatabase);

	it("uses alias overrides instead of domain defaults", async () => {
		const primary = await createDestinationRecord(
			db,
			{
				email: "primary@example.com",
				enabled: true,
				label: "Primary",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const secondary = await createDestinationRecord(
			db,
			{
				email: "secondary@example.com",
				enabled: true,
				label: "Secondary",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const domain = await createDomain(db, {
			defaultDestinationIds: [primary.id],
			fqdn: "drop.example.com",
			status: "active",
			zoneId: "zone-1",
		});

		await createAlias(db, {
			active: true,
			domainId: domain.id,
			label: "Notion",
			localPart: "notion",
			overrideDestinationIds: [secondary.id],
			routingMode: "override",
		});

		const snapshot = await findAliasRoutingSnapshot(db, {
			baseLocalPart: "notion",
			domain: domain.fqdn,
			localPart: "notion",
			subaddressTag: null,
		});

		expect(snapshot.destinations.map((destination) => destination.email)).toStrictEqual([
			"secondary@example.com",
		]);
	});

	it("keeps aliases inactive when their effective destinations are unverified", async () => {
		const pendingDestination = await createDestinationRecord(db, {
			email: "pending@example.com",
			enabled: true,
			label: "Pending",
		});
		const domain = await createDomain(db, {
			defaultDestinationIds: [pendingDestination.id],
			fqdn: "pending.example.com",
			status: "pending",
			zoneId: "zone-2",
		});

		const alias = await createAlias(db, {
			active: true,
			domainId: domain.id,
			label: "Signup",
			localPart: "signup",
			overrideDestinationIds: [],
			routingMode: "domain_default",
		});

		expect(alias.active).toBeFalsy();
		expect(alias.effectiveDestinations).toHaveLength(0);
	});

	it("resolves the same local part independently across multiple domains", async () => {
		const alphaDestination = await createDestinationRecord(
			db,
			{
				email: "alpha@example.com",
				enabled: true,
				label: "Alpha",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const betaDestination = await createDestinationRecord(
			db,
			{
				email: "beta@example.com",
				enabled: true,
				label: "Beta",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const alphaDomain = await createDomain(db, {
			defaultDestinationIds: [alphaDestination.id],
			fqdn: "alpha.example.com",
			status: "active",
			zoneId: "zone-alpha",
		});
		const betaDomain = await createDomain(db, {
			defaultDestinationIds: [betaDestination.id],
			fqdn: "beta.example.com",
			status: "active",
			zoneId: "zone-beta",
		});

		await createAlias(db, {
			active: true,
			domainId: alphaDomain.id,
			label: "Alpha Login",
			localPart: "login",
			overrideDestinationIds: [],
			routingMode: "domain_default",
		});
		await createAlias(db, {
			active: true,
			domainId: betaDomain.id,
			label: "Beta Login",
			localPart: "login",
			overrideDestinationIds: [],
			routingMode: "domain_default",
		});

		const alphaSnapshot = await findAliasRoutingSnapshot(db, {
			baseLocalPart: "login",
			domain: alphaDomain.fqdn,
			localPart: "login",
			subaddressTag: null,
		});
		const betaSnapshot = await findAliasRoutingSnapshot(db, {
			baseLocalPart: "login",
			domain: betaDomain.fqdn,
			localPart: "login",
			subaddressTag: null,
		});

		expect(alphaSnapshot.destinations[0]?.email).toBe("alpha@example.com");
		expect(betaSnapshot.destinations[0]?.email).toBe("beta@example.com");
	});
});
