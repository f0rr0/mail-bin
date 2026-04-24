import { z } from "zod";

export const domainStatusValues = ["active", "pending", "misconfigured"] as const;
export const destinationVerificationValues = ["pending", "verified"] as const;
export const routingModeValues = ["domain_default", "override"] as const;
export const deliveryStatusValues = [
	"forwarded",
	"partial_failure",
	"rejected_unknown_domain",
	"rejected_unknown_alias",
	"rejected_disabled_alias",
	"rejected_no_destinations",
	"processing_error",
] as const;
export const deliveryAttemptStatusValues = ["forwarded", "failed"] as const;

export const DomainStatusSchema = z.enum(domainStatusValues);
export const DestinationVerificationSchema = z.enum(destinationVerificationValues);
export const RoutingModeSchema = z.enum(routingModeValues);
export const DeliveryStatusSchema = z.enum(deliveryStatusValues);
export const DeliveryAttemptStatusSchema = z.enum(deliveryAttemptStatusValues);

export const DestinationSchema = z.object({
	cloudflareDestinationId: z.string().nullable(),
	createdAt: z.string().datetime(),
	email: z.string().email(),
	enabled: z.boolean(),
	id: z.string(),
	label: z.string(),
	updatedAt: z.string().datetime(),
	verificationStatus: DestinationVerificationSchema,
	verifiedAt: z.string().datetime().nullable(),
});

export const DomainSchema = z.object({
	createdAt: z.string().datetime(),
	defaultDestinations: z.array(DestinationSchema),
	fqdn: z.string(),
	id: z.string(),
	status: DomainStatusSchema,
	updatedAt: z.string().datetime(),
	zoneId: z.string(),
});

export const AliasSchema = z.object({
	active: z.boolean(),
	createdAt: z.string().datetime(),
	createdFor: z.string().nullable(),
	domainFqdn: z.string(),
	domainId: z.string(),
	effectiveDestinations: z.array(DestinationSchema),
	id: z.string(),
	label: z.string(),
	localPart: z.string(),
	overrideDestinations: z.array(DestinationSchema),
	routingMode: RoutingModeSchema,
	updatedAt: z.string().datetime(),
});

export const DeliveryAttemptSchema = z.object({
	createdAt: z.string().datetime(),
	destinationEmail: z.string().email(),
	destinationId: z.string().nullable(),
	errorCode: z.string().nullable(),
	eventId: z.string(),
	id: z.string(),
	status: DeliveryAttemptStatusSchema,
});

export const DeliveryEventSchema = z.object({
	aliasId: z.string().nullable(),
	aliasLabel: z.string().nullable(),
	attempts: z.array(DeliveryAttemptSchema),
	domainFqdn: z.string().nullable(),
	domainId: z.string().nullable(),
	errorCode: z.string().nullable(),
	fromAddress: z.string(),
	id: z.string(),
	localPart: z.string(),
	messageId: z.string().nullable(),
	receivedAt: z.string().datetime(),
	recipientAddress: z.string(),
	resolvedLocalPart: z.string().nullable(),
	status: DeliveryStatusSchema,
	subaddressTag: z.string().nullable(),
	subject: z.string().nullable(),
});

export const CloudflareSyncSummarySchema = z.object({
	domains: z.array(
		z.object({
			fqdn: z.string(),
			status: DomainStatusSchema,
			routingEnabled: z.boolean(),
			catchAllAction: z.string().nullable(),
		}),
	),
	syncedDestinations: z.number().int().nonnegative(),
	syncedDomains: z.number().int().nonnegative(),
});

export const CreateDomainInputSchema = z.object({
	defaultDestinationIds: z.array(z.string()).default([]),
	fqdn: z
		.string()
		.trim()
		.min(3)
		.transform((value) => value.toLowerCase()),
	status: DomainStatusSchema.default("pending"),
	zoneId: z.string().trim().min(1),
});

export const CreateDestinationInputSchema = z.object({
	email: z
		.string()
		.trim()
		.email()
		.transform((value) => value.toLowerCase()),
	enabled: z.boolean().default(true),
	label: z.string().trim().min(1).max(120).optional(),
});

export const CreateAliasInputSchema = z.object({
	active: z.boolean().default(true),
	createdFor: z.string().trim().max(240).optional(),
	domainId: z.string(),
	label: z.string().trim().min(1).max(120),
	localPart: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.regex(/^[A-Za-z0-9._+-]+$/)
		.transform((value) => value.toLowerCase()),
	overrideDestinationIds: z.array(z.string()).default([]),
	routingMode: RoutingModeSchema.default("domain_default"),
});

export const UpdateAliasInputSchema = z.object({
	active: z.boolean().optional(),
	createdFor: z.string().trim().max(240).nullable().optional(),
	id: z.string(),
	label: z.string().trim().min(1).max(120).optional(),
	overrideDestinationIds: z.array(z.string()).optional(),
	routingMode: RoutingModeSchema.optional(),
});

export type Domain = z.infer<typeof DomainSchema>;
export type Destination = z.infer<typeof DestinationSchema>;
export type Alias = z.infer<typeof AliasSchema>;
export type DeliveryEvent = z.infer<typeof DeliveryEventSchema>;
export type DeliveryAttempt = z.infer<typeof DeliveryAttemptSchema>;
export type CreateDomainInput = z.infer<typeof CreateDomainInputSchema>;
export type CreateDestinationInput = z.infer<typeof CreateDestinationInputSchema>;
export type CreateAliasInput = z.infer<typeof CreateAliasInputSchema>;
export type UpdateAliasInput = z.infer<typeof UpdateAliasInputSchema>;
export type CloudflareSyncSummary = z.infer<typeof CloudflareSyncSummarySchema>;
