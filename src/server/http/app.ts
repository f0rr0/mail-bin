import { Scalar } from "@scalar/hono-api-reference";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import type { AppBindings } from "@/server/app-env";
import {
	disableAlias,
	listAliases,
	listDestinations,
	listDomains,
	listEvents,
	updateAlias,
	createAlias,
	createDestinationRecord,
	createDomain,
} from "@/server/data/service";
import { getDb } from "@/server/db";
import { normalizeAppError } from "@/server/errors";
import {
	AliasSchema,
	CloudflareSyncSummarySchema,
	CreateAliasInputSchema,
	CreateDestinationInputSchema,
	CreateDomainInputSchema,
	DeliveryEventSchema,
	DomainSchema,
	DestinationSchema,
	UpdateAliasInputSchema,
} from "@/shared/schemas";
import { createCloudflareBackedDestination, syncCloudflareState } from "@/server/sync/cloudflare";

const JsonErrorSchema = z.object({
	message: z.string(),
});

const app = new OpenAPIHono<{ Bindings: AppBindings }>().basePath("/api");

app.onError((error) => {
	const normalized = normalizeAppError(error);
	return Response.json(
		{ message: normalized.message },
		{
			status: normalized.status,
		},
	);
});

app.doc("/openapi.json", {
	info: {
		description: "Single-admin disposable email routing service.",
		title: "Mail Bin API",
		version: "1.0.0",
	},
	openapi: "3.0.0",
});

app.get("/docs", Scalar({ url: "/api/openapi.json" }));

const domainsListApp = app.openapi(
	createRoute({
		method: "get",
		path: "/domains",
		responses: {
			200: {
				content: {
					"application/json": {
						schema: z.array(DomainSchema),
					},
				},
				description: "List domains",
			},
		},
	}),
	async (context) => context.json(await listDomains(getDb(context.env)), 200),
);

const createDomainApp = domainsListApp.openapi(
	createRoute({
		method: "post",
		path: "/domains",
		request: {
			body: {
				content: {
					"application/json": {
						schema: CreateDomainInputSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: DomainSchema,
					},
				},
				description: "Create domain",
			},
			400: {
				content: {
					"application/json": {
						schema: JsonErrorSchema,
					},
				},
				description: "Invalid domain request",
			},
		},
	}),
	async (context) => {
		const payload = context.req.valid("json");
		return context.json(await createDomain(getDb(context.env), payload), 200);
	},
);

const destinationsListApp = createDomainApp.openapi(
	createRoute({
		method: "get",
		path: "/destinations",
		responses: {
			200: {
				content: {
					"application/json": {
						schema: z.array(DestinationSchema),
					},
				},
				description: "List destinations",
			},
		},
	}),
	async (context) => context.json(await listDestinations(getDb(context.env)), 200),
);

const createDestinationApp = destinationsListApp.openapi(
	createRoute({
		method: "post",
		path: "/destinations",
		request: {
			body: {
				content: {
					"application/json": {
						schema: CreateDestinationInputSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: DestinationSchema,
					},
				},
				description: "Create destination",
			},
		},
	}),
	async (context) => {
		const payload = context.req.valid("json");
		let cloudflareDestination: Awaited<
			ReturnType<typeof createCloudflareBackedDestination>
		> | null = null;

		if (context.env.CLOUDFLARE_API_TOKEN && context.env.CLOUDFLARE_ACCOUNT_ID) {
			cloudflareDestination = await createCloudflareBackedDestination(context.env, payload.email);
		}

		return context.json(
			await createDestinationRecord(getDb(context.env), payload, {
				cloudflareDestinationId: cloudflareDestination?.id ?? null,
				verifiedAt: cloudflareDestination?.verified
					? new Date(cloudflareDestination.verified)
					: null,
			}),
			200,
		);
	},
);

const aliasesListApp = createDestinationApp.openapi(
	createRoute({
		method: "get",
		path: "/aliases",
		responses: {
			200: {
				content: {
					"application/json": {
						schema: z.array(AliasSchema),
					},
				},
				description: "List aliases",
			},
		},
	}),
	async (context) => context.json(await listAliases(getDb(context.env)), 200),
);

const createAliasApp = aliasesListApp.openapi(
	createRoute({
		method: "post",
		path: "/aliases",
		request: {
			body: {
				content: {
					"application/json": {
						schema: CreateAliasInputSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: AliasSchema,
					},
				},
				description: "Create alias",
			},
		},
	}),
	async (context) =>
		context.json(await createAlias(getDb(context.env), context.req.valid("json")), 200),
);

const updateAliasApp = createAliasApp.openapi(
	createRoute({
		method: "patch",
		path: "/aliases",
		request: {
			body: {
				content: {
					"application/json": {
						schema: UpdateAliasInputSchema,
					},
				},
			},
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: AliasSchema,
					},
				},
				description: "Update alias",
			},
		},
	}),
	async (context) =>
		context.json(await updateAlias(getDb(context.env), context.req.valid("json")), 200),
);

const disableAliasApp = updateAliasApp.openapi(
	createRoute({
		method: "post",
		path: "/aliases/{id}/disable",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			200: {
				content: {
					"application/json": {
						schema: AliasSchema,
					},
				},
				description: "Disable alias",
			},
		},
	}),
	async (context) =>
		context.json(await disableAlias(getDb(context.env), context.req.valid("param").id), 200),
);

const eventsApp = disableAliasApp.openapi(
	createRoute({
		method: "get",
		path: "/events",
		responses: {
			200: {
				content: {
					"application/json": {
						schema: z.array(DeliveryEventSchema),
					},
				},
				description: "List delivery events",
			},
		},
	}),
	async (context) => context.json(await listEvents(getDb(context.env)), 200),
);

const syncCloudflareApp = eventsApp.openapi(
	createRoute({
		method: "post",
		path: "/sync/cloudflare",
		responses: {
			200: {
				content: {
					"application/json": {
						schema: CloudflareSyncSummarySchema,
					},
				},
				description: "Sync Cloudflare routing state",
			},
		},
	}),
	async (context) => context.json(await syncCloudflareState(context.env), 200),
);

export type AppType = typeof syncCloudflareApp;

export function createApiApp() {
	return syncCloudflareApp;
}
