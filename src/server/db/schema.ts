import { relations } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
	deliveryAttemptStatusValues,
	deliveryStatusValues,
	destinationVerificationValues,
	domainStatusValues,
	routingModeValues,
} from "@/shared/schemas";

export const domains = sqliteTable(
	"domains",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		fqdn: text("fqdn").notNull(),
		id: text("id").primaryKey(),
		status: text("status", { enum: domainStatusValues }).notNull().default("pending"),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		zoneId: text("zone_id").notNull(),
	},
	(table) => [uniqueIndex("domains_fqdn_unique").on(table.fqdn)],
);

export const destinations = sqliteTable(
	"destinations",
	{
		cloudflareDestinationId: text("cloudflare_destination_id"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		email: text("email").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		id: text("id").primaryKey(),
		label: text("label").notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		verificationStatus: text("verification_status", {
			enum: destinationVerificationValues,
		})
			.notNull()
			.default("pending"),
		verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
	},
	(table) => [
		uniqueIndex("destinations_email_unique").on(table.email),
		uniqueIndex("destinations_cloudflare_id_unique").on(table.cloudflareDestinationId),
	],
);

export const domainDefaultDestinations = sqliteTable(
	"domain_default_destinations",
	{
		destinationId: text("destination_id")
			.notNull()
			.references(() => destinations.id, { onDelete: "cascade" }),
		domainId: text("domain_id")
			.notNull()
			.references(() => domains.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.domainId, table.destinationId] }),
		index("domain_default_destinations_domain_idx").on(table.domainId),
	],
);

export const aliases = sqliteTable(
	"aliases",
	{
		active: integer("active", { mode: "boolean" }).notNull().default(true),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		createdFor: text("created_for"),
		domainId: text("domain_id")
			.notNull()
			.references(() => domains.id, { onDelete: "cascade" }),
		id: text("id").primaryKey(),
		label: text("label").notNull(),
		localPart: text("local_part").notNull(),
		routingMode: text("routing_mode", { enum: routingModeValues })
			.notNull()
			.default("domain_default"),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("aliases_domain_local_unique").on(table.domainId, table.localPart),
		index("aliases_domain_idx").on(table.domainId),
	],
);

export const aliasOverrideDestinations = sqliteTable(
	"alias_override_destinations",
	{
		aliasId: text("alias_id")
			.notNull()
			.references(() => aliases.id, { onDelete: "cascade" }),
		destinationId: text("destination_id")
			.notNull()
			.references(() => destinations.id, { onDelete: "cascade" }),
	},
	(table) => [
		primaryKey({ columns: [table.aliasId, table.destinationId] }),
		index("alias_override_destinations_alias_idx").on(table.aliasId),
	],
);

export const deliveryEvents = sqliteTable(
	"delivery_events",
	{
		aliasId: text("alias_id").references(() => aliases.id, {
			onDelete: "set null",
		}),
		domainId: text("domain_id").references(() => domains.id, {
			onDelete: "set null",
		}),
		errorCode: text("error_code"),
		fromAddress: text("from_address").notNull(),
		id: text("id").primaryKey(),
		localPart: text("local_part").notNull(),
		messageId: text("message_id"),
		receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
		recipientAddress: text("recipient_address").notNull(),
		resolvedLocalPart: text("resolved_local_part"),
		status: text("status", { enum: deliveryStatusValues }).notNull(),
		subaddressTag: text("subaddress_tag"),
		subject: text("subject"),
	},
	(table) => [
		index("delivery_events_received_idx").on(table.receivedAt),
		index("delivery_events_alias_idx").on(table.aliasId),
	],
);

export const deliveryAttempts = sqliteTable(
	"delivery_attempts",
	{
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		destinationEmail: text("destination_email").notNull(),
		destinationId: text("destination_id").references(() => destinations.id, {
			onDelete: "set null",
		}),
		errorCode: text("error_code"),
		eventId: text("event_id")
			.notNull()
			.references(() => deliveryEvents.id, { onDelete: "cascade" }),
		id: text("id").primaryKey(),
		status: text("status", { enum: deliveryAttemptStatusValues }).notNull(),
	},
	(table) => [index("delivery_attempts_event_idx").on(table.eventId)],
);

export const domainRelations = relations(domains, ({ many }) => ({
	aliases: many(aliases),
	defaultDestinations: many(domainDefaultDestinations),
	events: many(deliveryEvents),
}));

export const destinationRelations = relations(destinations, ({ many }) => ({
	aliasLinks: many(aliasOverrideDestinations),
	attempts: many(deliveryAttempts),
	domainLinks: many(domainDefaultDestinations),
}));

export const aliasRelations = relations(aliases, ({ one, many }) => ({
	domain: one(domains, {
		fields: [aliases.domainId],
		references: [domains.id],
	}),
	events: many(deliveryEvents),
	overrideDestinations: many(aliasOverrideDestinations),
}));
