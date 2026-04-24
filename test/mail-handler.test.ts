import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb } from "@/server/db";
import {
	createAlias,
	createDestinationRecord,
	createDomain,
	listEvents,
} from "@/server/data/service";
import { handleIncomingEmail } from "@/server/mail/handler";
import { testAssetFetcher } from "./helpers/fetcher";
import { ensureSchema, resetDatabase } from "./helpers/db";

function createRawMessage(raw: string) {
	const { body } = new Response(raw);

	if (!body) {
		throw new Error("Failed to construct readable stream for test email.");
	}

	return body;
}

function createEmailMessage(options: {
	from: string;
	to: string;
	raw: string;
	subject?: string;
	messageId?: string;
	forwardImpl?: (destination: string) => Promise<void> | void;
}) {
	return {
		forward: vi.fn<(destination: string, headers?: Headers) => Promise<EmailSendResult>>(
			async (destination) => {
				await options.forwardImpl?.(destination);
				return {} as EmailSendResult;
			},
		),
		from: options.from,
		headers: new Headers({
			...(options.subject ? { subject: options.subject } : {}),
			...(options.messageId ? { "message-id": options.messageId } : {}),
		}),
		raw: createRawMessage(options.raw),
		rawSize: options.raw.length,
		reply: vi.fn<(message: EmailMessage) => Promise<EmailSendResult>>(() =>
			Promise.resolve({} as EmailSendResult),
		),
		setReject: vi.fn<(reason: string) => void>(),
		to: options.to,
	} satisfies ForwardableEmailMessage;
}

describe("mail handler", () => {
	const db = getDb(env);

	beforeAll(ensureSchema);
	beforeEach(resetDatabase);

	it("captures plus-tags and logs per-destination forwarding outcomes", async () => {
		const primary = await createDestinationRecord(
			db,
			{
				email: "primary@example.com",
				enabled: true,
				label: "Primary",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const fallback = await createDestinationRecord(
			db,
			{
				email: "fallback@example.com",
				enabled: true,
				label: "Fallback",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const domain = await createDomain(db, {
			defaultDestinationIds: [primary.id],
			fqdn: "drop.example.com",
			status: "active",
			zoneId: "zone-mail",
		});

		await createAlias(db, {
			active: true,
			domainId: domain.id,
			label: "Notion",
			localPart: "notion",
			overrideDestinationIds: [primary.id, fallback.id],
			routingMode: "override",
		});

		const message = createEmailMessage({
			forwardImpl: (destination) => {
				if (destination === "fallback@example.com") {
					throw new Error("simulated_forward_failure");
				}
			},
			from: "sender@example.com",
			messageId: "<plus-tag-1@test>",
			raw: `From: sender@example.com
To: notion+ios@drop.example.com
Subject: Login
Date: Tue, 19 Apr 2026 12:00:00 +0000
Message-ID: <plus-tag-1@test>

Hello from a routed message.`,
			subject: "Login",
			to: "notion+ios@drop.example.com",
		});

		await handleIncomingEmail(message, {
			...env,
			APP_ENV: "test",
			APP_NAME: "Mail Bin",
			ASSETS: testAssetFetcher,
		});

		expect(message.setReject).not.toHaveBeenCalled();
		expect(message.forward).toHaveBeenCalledTimes(2);
		expect(message.forward).toHaveBeenCalledWith("primary@example.com");
		expect(message.forward).toHaveBeenCalledWith("fallback@example.com");

		const [event] = await listEvents(db);
		expect(event.status).toBe("partial_failure");
		expect(event.subaddressTag).toBe("ios");
		expect(event.resolvedLocalPart).toBe("notion");
		expect(event.subject).toBe("Login");
		expect(event.messageId).toBe("<plus-tag-1@test>");
		expect(event.attempts).toHaveLength(2);
		expect(event.attempts.map((attempt) => attempt.status).toSorted()).toStrictEqual([
			"failed",
			"forwarded",
		]);
	});

	it("rejects disabled aliases and records the rejection", async () => {
		const destination = await createDestinationRecord(
			db,
			{
				email: "primary@example.com",
				enabled: true,
				label: "Primary",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);
		const domain = await createDomain(db, {
			defaultDestinationIds: [destination.id],
			fqdn: "drop.example.com",
			status: "active",
			zoneId: "zone-mail-2",
		});

		await createAlias(db, {
			active: false,
			domainId: domain.id,
			label: "Legacy",
			localPart: "legacy",
			overrideDestinationIds: [],
			routingMode: "domain_default",
		});

		const message = createEmailMessage({
			from: "sender@example.com",
			raw: `From: sender@example.com
To: legacy@drop.example.com
Subject: Disabled route
Date: Tue, 19 Apr 2026 12:00:00 +0000
Message-ID: <disabled-1@test>

This should reject.`,
			to: "legacy@drop.example.com",
		});

		await handleIncomingEmail(message, {
			...env,
			APP_ENV: "test",
			APP_NAME: "Mail Bin",
			ASSETS: testAssetFetcher,
		});

		expect(message.setReject).toHaveBeenCalledWith("Alias is disabled.");
		const [event] = await listEvents(db);
		expect(event.status).toBe("rejected_disabled_alias");
	});

	it("rejects unknown aliases on known domains", async () => {
		const destination = await createDestinationRecord(
			db,
			{
				email: "primary@example.com",
				enabled: true,
				label: "Primary",
			},
			{ verifiedAt: new Date("2026-04-19T00:00:00.000Z") },
		);

		await createDomain(db, {
			defaultDestinationIds: [destination.id],
			fqdn: "drop.example.com",
			status: "active",
			zoneId: "zone-mail-3",
		});

		const message = createEmailMessage({
			from: "sender@example.com",
			raw: `From: sender@example.com
To: missing@drop.example.com
Subject: Missing route
Date: Tue, 19 Apr 2026 12:00:00 +0000
Message-ID: <missing-1@test>

This should reject.`,
			to: "missing@drop.example.com",
		});

		await handleIncomingEmail(message, {
			...env,
			APP_ENV: "test",
			APP_NAME: "Mail Bin",
			ASSETS: testAssetFetcher,
		});

		expect(message.setReject).toHaveBeenCalledWith("Alias not found.");
		const [event] = await listEvents(db);
		expect(event.status).toBe("rejected_unknown_alias");
	});
});
