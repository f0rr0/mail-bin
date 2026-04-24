import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import type {
	Alias,
	CreateAliasInput,
	CreateDestinationInput,
	CreateDomainInput,
	DeliveryAttempt,
	DeliveryEvent,
	Destination,
	Domain,
	UpdateAliasInput,
} from "@/shared/schemas";
import {
	aliases,
	aliasOverrideDestinations,
	destinations,
	deliveryAttempts,
	deliveryEvents,
	domainDefaultDestinations,
	domains,
} from "@/server/db/schema";
import type { AppDb } from "@/server/db";
import { AppError } from "@/server/errors";

type Database = AppDb;

type AliasRow = typeof aliases.$inferSelect;
type DestinationRow = typeof destinations.$inferSelect;
type AttemptRow = typeof deliveryAttempts.$inferSelect;

function toIso(value: Date | null | undefined) {
	return value ? value.toISOString() : null;
}

function serializeDestination(row: DestinationRow): Destination {
	return {
		cloudflareDestinationId: row.cloudflareDestinationId ?? null,
		createdAt: row.createdAt.toISOString(),
		email: row.email,
		enabled: row.enabled,
		id: row.id,
		label: row.label,
		updatedAt: row.updatedAt.toISOString(),
		verificationStatus: row.verificationStatus,
		verifiedAt: toIso(row.verifiedAt),
	};
}

function mapByKey<T>(rows: T[], keyOf: (row: T) => string) {
	const map = new Map<string, T[]>();

	for (const row of rows) {
		const key = keyOf(row);
		const bucket = map.get(key) ?? [];
		bucket.push(row);
		map.set(key, bucket);
	}

	return map;
}

function getRoutableDestinations(destinationRecords: Destination[]) {
	return destinationRecords.filter(
		(destination) => destination.enabled && destination.verificationStatus === "verified",
	);
}

async function assertDestinationIds(db: Database, ids: string[]) {
	if (ids.length === 0) {
		return [] as DestinationRow[];
	}

	const rows = await db.select().from(destinations).where(inArray(destinations.id, ids));

	if (rows.length !== ids.length) {
		throw new AppError(400, "One or more destinations do not exist.");
	}

	return rows;
}

async function getDefaultDestinationsForDomains(db: Database, domainIds: string[]) {
	if (domainIds.length === 0) {
		return new Map<string, Destination[]>();
	}

	const rows = await db
		.select({
			destination: destinations,
			domainId: domainDefaultDestinations.domainId,
		})
		.from(domainDefaultDestinations)
		.innerJoin(destinations, eq(domainDefaultDestinations.destinationId, destinations.id))
		.where(inArray(domainDefaultDestinations.domainId, domainIds));

	const grouped = mapByKey(rows, (row) => row.domainId);

	return new Map(
		[...grouped.entries()].map(([domainId, records]) => [
			domainId,
			records.map((record) => serializeDestination(record.destination)),
		]),
	);
}

async function getOverrideDestinationsForAliases(db: Database, aliasIds: string[]) {
	if (aliasIds.length === 0) {
		return new Map<string, Destination[]>();
	}

	const rows = await db
		.select({
			aliasId: aliasOverrideDestinations.aliasId,
			destination: destinations,
		})
		.from(aliasOverrideDestinations)
		.innerJoin(destinations, eq(aliasOverrideDestinations.destinationId, destinations.id))
		.where(inArray(aliasOverrideDestinations.aliasId, aliasIds));

	const grouped = mapByKey(rows, (row) => row.aliasId);

	return new Map(
		[...grouped.entries()].map(([aliasId, records]) => [
			aliasId,
			records.map((record) => serializeDestination(record.destination)),
		]),
	);
}

async function getDomainById(db: Database, domainId: string) {
	const [row] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);

	return row ?? null;
}

async function getAliasByIdRow(db: Database, aliasId: string) {
	const [row] = await db
		.select({
			alias: aliases,
			domainFqdn: domains.fqdn,
		})
		.from(aliases)
		.innerJoin(domains, eq(aliases.domainId, domains.id))
		.where(eq(aliases.id, aliasId))
		.limit(1);

	return row ?? null;
}

async function requireDomain(db: Database, domainId: string) {
	const domain = await getDomainById(db, domainId);

	if (!domain) {
		throw new AppError(404, "Domain not found.");
	}

	return domain;
}

async function requireAlias(db: Database, aliasId: string) {
	const alias = await getAliasByIdRow(db, aliasId);

	if (!alias) {
		throw new AppError(404, "Alias not found.");
	}

	return alias;
}

export async function listDomains(db: Database): Promise<Domain[]> {
	const rows = await db.select().from(domains).orderBy(desc(domains.createdAt));
	const defaultsMap = await getDefaultDestinationsForDomains(
		db,
		rows.map((row) => row.id),
	);

	return rows.map((row) => ({
		createdAt: row.createdAt.toISOString(),
		defaultDestinations: defaultsMap.get(row.id) ?? [],
		fqdn: row.fqdn,
		id: row.id,
		status: row.status,
		updatedAt: row.updatedAt.toISOString(),
		zoneId: row.zoneId,
	}));
}

export async function createDomain(db: Database, input: CreateDomainInput): Promise<Domain> {
	await assertDestinationIds(db, input.defaultDestinationIds);

	const now = new Date();
	const domainId = nanoid();

	await db.insert(domains).values({
		createdAt: now,
		fqdn: input.fqdn,
		id: domainId,
		status: input.status,
		updatedAt: now,
		zoneId: input.zoneId,
	});

	if (input.defaultDestinationIds.length > 0) {
		await db.insert(domainDefaultDestinations).values(
			input.defaultDestinationIds.map((destinationId) => ({
				destinationId,
				domainId,
			})),
		);
	}

	const domain = await getDomainById(db, domainId);

	if (!domain) {
		throw new AppError(500, "Domain could not be reloaded after creation.");
	}

	const [serialized] = await listDomainsByIds(db, [domain.id]);

	return serialized;
}

async function listDomainsByIds(db: Database, ids: string[]) {
	if (ids.length === 0) {
		return [] as Domain[];
	}

	const rows = await db.select().from(domains).where(inArray(domains.id, ids));
	const defaultsMap = await getDefaultDestinationsForDomains(
		db,
		rows.map((row) => row.id),
	);

	return rows.map((row) => ({
		createdAt: row.createdAt.toISOString(),
		defaultDestinations: defaultsMap.get(row.id) ?? [],
		fqdn: row.fqdn,
		id: row.id,
		status: row.status,
		updatedAt: row.updatedAt.toISOString(),
		zoneId: row.zoneId,
	}));
}

export async function updateDomainStatus(db: Database, domainId: string, status: Domain["status"]) {
	await db
		.update(domains)
		.set({
			status,
			updatedAt: new Date(),
		})
		.where(eq(domains.id, domainId));
}

export async function listDestinations(db: Database): Promise<Destination[]> {
	const rows = await db.select().from(destinations).orderBy(desc(destinations.createdAt));

	return rows.map(serializeDestination);
}

export async function createDestinationRecord(
	db: Database,
	input: CreateDestinationInput,
	options?: {
		cloudflareDestinationId?: string | null;
		verifiedAt?: Date | null;
	},
): Promise<Destination> {
	const now = new Date();
	const destinationId = nanoid();
	const verifiedAt = options?.verifiedAt ?? null;

	await db.insert(destinations).values({
		cloudflareDestinationId: options?.cloudflareDestinationId ?? null,
		createdAt: now,
		email: input.email,
		enabled: input.enabled,
		id: destinationId,
		label: input.label?.trim() || input.email,
		updatedAt: now,
		verificationStatus: verifiedAt ? "verified" : "pending",
		verifiedAt,
	});

	const [row] = await db
		.select()
		.from(destinations)
		.where(eq(destinations.id, destinationId))
		.limit(1);

	if (!row) {
		throw new AppError(500, "Destination could not be reloaded after creation.");
	}

	return serializeDestination(row);
}

export async function upsertDestinationFromCloudflare(
	db: Database,
	input: {
		email: string;
		cloudflareDestinationId: string;
		verifiedAt: Date | null;
	},
): Promise<Destination> {
	const now = new Date();
	const verificationStatus = input.verifiedAt ? "verified" : "pending";
	const [existing] = await db
		.select()
		.from(destinations)
		.where(eq(destinations.email, input.email))
		.limit(1);

	if (!existing) {
		return createDestinationRecord(
			db,
			{
				email: input.email,
				enabled: true,
				label: input.email,
			},
			{
				cloudflareDestinationId: input.cloudflareDestinationId,
				verifiedAt: input.verifiedAt,
			},
		);
	}

	await db
		.update(destinations)
		.set({
			cloudflareDestinationId: input.cloudflareDestinationId,
			updatedAt: now,
			verificationStatus,
			verifiedAt: input.verifiedAt,
		})
		.where(eq(destinations.id, existing.id));

	const [reloaded] = await db
		.select()
		.from(destinations)
		.where(eq(destinations.id, existing.id))
		.limit(1);

	if (!reloaded) {
		throw new AppError(500, "Destination could not be reloaded after sync.");
	}

	return serializeDestination(reloaded);
}

function requireEffectiveDestinations(
	routingMode: Alias["routingMode"],
	overrideDestinationIds: string[],
	defaultDestinationCount: number,
) {
	if (routingMode === "override" && overrideDestinationIds.length === 0) {
		throw new AppError(400, "Override aliases must select at least one destination.");
	}

	if (routingMode === "domain_default" && defaultDestinationCount === 0) {
		throw new AppError(400, "The domain has no default destinations yet.");
	}
}

export async function listAliases(db: Database): Promise<Alias[]> {
	const rows = await db
		.select({
			alias: aliases,
			domainFqdn: domains.fqdn,
		})
		.from(aliases)
		.innerJoin(domains, eq(aliases.domainId, domains.id))
		.orderBy(desc(aliases.createdAt));

	const overrideMap = await getOverrideDestinationsForAliases(
		db,
		rows.map((row) => row.alias.id),
	);
	const defaultMap = await getDefaultDestinationsForDomains(
		db,
		rows.map((row) => row.alias.domainId),
	);

	return rows.map((row) => {
		const overrideDestinations = overrideMap.get(row.alias.id) ?? [];
		const defaultDestinations = defaultMap.get(row.alias.domainId) ?? [];
		const configuredEffectiveDestinations =
			row.alias.routingMode === "override" && overrideDestinations.length > 0
				? overrideDestinations
				: defaultDestinations;
		const effectiveDestinations = getRoutableDestinations(configuredEffectiveDestinations);

		return {
			active: row.alias.active,
			createdAt: row.alias.createdAt.toISOString(),
			createdFor: row.alias.createdFor ?? null,
			domainFqdn: row.domainFqdn,
			domainId: row.alias.domainId,
			effectiveDestinations,
			id: row.alias.id,
			label: row.alias.label,
			localPart: row.alias.localPart,
			overrideDestinations,
			routingMode: row.alias.routingMode,
			updatedAt: row.alias.updatedAt.toISOString(),
		};
	});
}

export async function createAlias(db: Database, input: CreateAliasInput): Promise<Alias> {
	const domain = await requireDomain(db, input.domainId);
	const overrideRows = await assertDestinationIds(db, input.overrideDestinationIds);
	const defaultDestinations = await getDefaultDestinationsForDomains(db, [domain.id]);
	const configuredDefaultDestinations = defaultDestinations.get(domain.id) ?? [];

	requireEffectiveDestinations(
		input.routingMode,
		input.overrideDestinationIds,
		configuredDefaultDestinations.length,
	);
	const configuredOverrideDestinations = overrideRows.map(serializeDestination);
	const configuredEffectiveDestinations =
		input.routingMode === "override"
			? configuredOverrideDestinations
			: configuredDefaultDestinations;
	const nextActive =
		input.active && getRoutableDestinations(configuredEffectiveDestinations).length > 0;

	const now = new Date();
	const aliasId = nanoid();

	await db.insert(aliases).values({
		active: nextActive,
		createdAt: now,
		createdFor: input.createdFor ?? null,
		domainId: input.domainId,
		id: aliasId,
		label: input.label,
		localPart: input.localPart,
		routingMode: input.routingMode,
		updatedAt: now,
	});

	if (input.overrideDestinationIds.length > 0) {
		await db.insert(aliasOverrideDestinations).values(
			input.overrideDestinationIds.map((destinationId) => ({
				aliasId,
				destinationId,
			})),
		);
	}

	const alias = await requireAlias(db, aliasId);
	const overrideMap = await getOverrideDestinationsForAliases(db, [alias.alias.id]);
	const defaultMap = await getDefaultDestinationsForDomains(db, [alias.alias.domainId]);
	const overrideDestinations = overrideMap.get(alias.alias.id) ?? [];
	const effectiveDestinations =
		alias.alias.routingMode === "override" && overrideDestinations.length > 0
			? getRoutableDestinations(overrideDestinations)
			: getRoutableDestinations(defaultMap.get(alias.alias.domainId) ?? []);

	return {
		active: alias.alias.active,
		createdAt: alias.alias.createdAt.toISOString(),
		createdFor: alias.alias.createdFor ?? null,
		domainFqdn: alias.domainFqdn,
		domainId: alias.alias.domainId,
		effectiveDestinations,
		id: alias.alias.id,
		label: alias.alias.label,
		localPart: alias.alias.localPart,
		overrideDestinations,
		routingMode: alias.alias.routingMode,
		updatedAt: alias.alias.updatedAt.toISOString(),
	};
}

export async function updateAlias(db: Database, input: UpdateAliasInput): Promise<Alias> {
	const current = await requireAlias(db, input.id);
	const overrideIds = input.overrideDestinationIds ?? null;

	if (overrideIds) {
		await assertDestinationIds(db, overrideIds);
	}

	const nextRoutingMode = input.routingMode ?? current.alias.routingMode;
	const currentOverrideDestinations = await getOverrideDestinationsForAliases(db, [input.id]);
	const nextOverrideIds =
		overrideIds ??
		(currentOverrideDestinations.get(input.id) ?? []).map((destination) => destination.id);
	const defaultMap = await getDefaultDestinationsForDomains(db, [current.alias.domainId]);
	const configuredDefaultDestinations = defaultMap.get(current.alias.domainId) ?? [];

	requireEffectiveDestinations(
		nextRoutingMode,
		nextOverrideIds,
		configuredDefaultDestinations.length,
	);
	let configuredOverrideDestinations = currentOverrideDestinations.get(input.id) ?? [];

	if (overrideIds) {
		const overrideDestinations = await assertDestinationIds(db, overrideIds);
		configuredOverrideDestinations = overrideDestinations.map(serializeDestination);
	}
	const configuredEffectiveDestinations =
		nextRoutingMode === "override" ? configuredOverrideDestinations : configuredDefaultDestinations;
	const nextActive =
		(input.active ?? current.alias.active) &&
		getRoutableDestinations(configuredEffectiveDestinations).length > 0;

	await db
		.update(aliases)
		.set({
			active: nextActive,
			createdFor: input.createdFor === undefined ? current.alias.createdFor : input.createdFor,
			label: input.label ?? current.alias.label,
			routingMode: nextRoutingMode,
			updatedAt: new Date(),
		})
		.where(eq(aliases.id, input.id));

	if (overrideIds) {
		await db
			.delete(aliasOverrideDestinations)
			.where(eq(aliasOverrideDestinations.aliasId, input.id));

		if (overrideIds.length > 0) {
			await db.insert(aliasOverrideDestinations).values(
				overrideIds.map((destinationId) => ({
					aliasId: input.id,
					destinationId,
				})),
			);
		}
	}

	const aliasRecords = await listAliases(db);
	const updated = aliasRecords.find((alias) => alias.id === input.id);

	if (!updated) {
		throw new AppError(500, "Alias could not be reloaded after update.");
	}

	return updated;
}

export function disableAlias(db: Database, aliasId: string) {
	return updateAlias(db, {
		active: false,
		id: aliasId,
	});
}

export async function listEvents(db: Database): Promise<DeliveryEvent[]> {
	const rows = await db
		.select({
			aliasLabel: aliases.label,
			domainFqdn: domains.fqdn,
			event: deliveryEvents,
		})
		.from(deliveryEvents)
		.leftJoin(aliases, eq(deliveryEvents.aliasId, aliases.id))
		.leftJoin(domains, eq(deliveryEvents.domainId, domains.id))
		.orderBy(desc(deliveryEvents.receivedAt))
		.limit(100);

	const eventIds = rows.map((row) => row.event.id);
	const attemptRows =
		eventIds.length > 0
			? await db.select().from(deliveryAttempts).where(inArray(deliveryAttempts.eventId, eventIds))
			: [];

	const attemptsMap = mapByKey(attemptRows, (row) => row.eventId);

	return rows.map((row) => ({
		aliasId: row.event.aliasId ?? null,
		aliasLabel: row.aliasLabel ?? null,
		attempts: (attemptsMap.get(row.event.id) ?? []).map(serializeAttempt),
		domainFqdn: row.domainFqdn ?? null,
		domainId: row.event.domainId ?? null,
		errorCode: row.event.errorCode ?? null,
		fromAddress: row.event.fromAddress,
		id: row.event.id,
		localPart: row.event.localPart,
		messageId: row.event.messageId ?? null,
		receivedAt: row.event.receivedAt.toISOString(),
		recipientAddress: row.event.recipientAddress,
		resolvedLocalPart: row.event.resolvedLocalPart ?? null,
		status: row.event.status,
		subaddressTag: row.event.subaddressTag ?? null,
		subject: row.event.subject ?? null,
	}));
}

function serializeAttempt(row: AttemptRow): DeliveryAttempt {
	return {
		createdAt: row.createdAt.toISOString(),
		destinationEmail: row.destinationEmail,
		destinationId: row.destinationId ?? null,
		errorCode: row.errorCode ?? null,
		eventId: row.eventId,
		id: row.id,
		status: row.status,
	};
}

export async function recordDeliveryEvent(
	db: Database,
	input: {
		aliasId?: string | null;
		domainId?: string | null;
		recipientAddress: string;
		localPart: string;
		resolvedLocalPart?: string | null;
		subaddressTag?: string | null;
		fromAddress: string;
		subject?: string | null;
		messageId?: string | null;
		status: DeliveryEvent["status"];
		errorCode?: string | null;
	},
) {
	const eventId = nanoid();
	await db.insert(deliveryEvents).values({
		aliasId: input.aliasId ?? null,
		domainId: input.domainId ?? null,
		errorCode: input.errorCode ?? null,
		fromAddress: input.fromAddress,
		id: eventId,
		localPart: input.localPart,
		messageId: input.messageId ?? null,
		receivedAt: new Date(),
		recipientAddress: input.recipientAddress,
		resolvedLocalPart: input.resolvedLocalPart ?? null,
		status: input.status,
		subaddressTag: input.subaddressTag ?? null,
		subject: input.subject ?? null,
	});

	return eventId;
}

export async function addDeliveryAttempt(
	db: Database,
	input: {
		eventId: string;
		destinationId?: string | null;
		destinationEmail: string;
		status: DeliveryAttempt["status"];
		errorCode?: string | null;
	},
) {
	await db.insert(deliveryAttempts).values({
		createdAt: new Date(),
		destinationEmail: input.destinationEmail,
		destinationId: input.destinationId ?? null,
		errorCode: input.errorCode ?? null,
		eventId: input.eventId,
		id: nanoid(),
		status: input.status,
	});
}

export async function updateDeliveryEventStatus(
	db: Database,
	eventId: string,
	status: DeliveryEvent["status"],
	errorCode?: string | null,
) {
	await db
		.update(deliveryEvents)
		.set({
			errorCode: errorCode ?? null,
			status,
		})
		.where(eq(deliveryEvents.id, eventId));
}

export async function findAliasRoutingSnapshot(
	db: Database,
	input: {
		domain: string;
		localPart: string;
		baseLocalPart: string;
		subaddressTag: string | null;
	},
) {
	const [domainRow] = await db
		.select()
		.from(domains)
		.where(eq(domains.fqdn, input.domain))
		.limit(1);

	if (!domainRow) {
		return {
			alias: null,
			destinations: [] as Destination[],
			domain: null,
			resolvedLocalPart: null,
		};
	}

	const candidates = [input.localPart];
	if (input.subaddressTag && input.baseLocalPart !== input.localPart) {
		candidates.push(input.baseLocalPart);
	}

	let aliasRow: AliasRow | null = null;
	let resolvedLocalPart: string | null = null;
	for (const candidate of candidates) {
		const [row] = await db
			.select()
			.from(aliases)
			.where(and(eq(aliases.domainId, domainRow.id), eq(aliases.localPart, candidate)))
			.limit(1);

		if (row) {
			aliasRow = row;
			resolvedLocalPart = candidate;
			break;
		}
	}

	if (!aliasRow) {
		return {
			alias: null,
			destinations: [] as Destination[],
			domain: domainRow,
			resolvedLocalPart: null,
		};
	}

	const overrideMap = await getOverrideDestinationsForAliases(db, [aliasRow.id]);
	const defaultMap = await getDefaultDestinationsForDomains(db, [aliasRow.domainId]);
	const overrideDestinations = overrideMap.get(aliasRow.id) ?? [];
	const defaultDestinations = defaultMap.get(aliasRow.domainId) ?? [];

	return {
		alias: aliasRow,
		destinations: getRoutableDestinations(
			aliasRow.routingMode === "override" && overrideDestinations.length > 0
				? overrideDestinations
				: defaultDestinations,
		),
		domain: domainRow,
		resolvedLocalPart,
	};
}
