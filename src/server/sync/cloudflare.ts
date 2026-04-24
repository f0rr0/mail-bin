import type { AppBindings } from "@/server/app-env";
import type { CloudflareSyncSummary } from "@/shared/schemas";
import {
	listDomains,
	updateDomainStatus,
	upsertDestinationFromCloudflare,
} from "@/server/data/service";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db";

interface ApiEnvelope<T> {
	success: boolean;
	errors?: { message?: string }[];
	result: T;
}

interface CloudflareDestination {
	id: string;
	email: string;
	verified: string | null;
}

interface CloudflareRoutingSettings {
	enabled: boolean;
	status?: string;
}

interface CloudflareCatchAll {
	enabled?: boolean;
	actions?: {
		type: "drop" | "forward" | "worker";
		value?: string[];
	}[];
}

class CloudflareEmailRoutingClient {
	private readonly env: AppBindings;

	constructor(env: AppBindings) {
		this.env = env;
	}

	private get token() {
		return this.env.CLOUDFLARE_API_TOKEN;
	}

	private get accountId() {
		return this.env.CLOUDFLARE_ACCOUNT_ID;
	}

	private async request<T>(path: string, init?: RequestInit) {
		if (!this.token) {
			throw new AppError(400, "CLOUDFLARE_API_TOKEN is not configured.");
		}

		const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
				...init?.headers,
			},
		});

		const payload = (await response.json()) as ApiEnvelope<T>;

		if (!response.ok || !payload.success) {
			const message = payload.errors?.[0]?.message || `Cloudflare API request failed for ${path}.`;
			throw new AppError(502, message);
		}

		return payload.result;
	}

	listDestinationAddresses() {
		if (!this.accountId) {
			throw new AppError(400, "CLOUDFLARE_ACCOUNT_ID is not configured.");
		}

		return this.request<CloudflareDestination[]>(
			`/accounts/${this.accountId}/email/routing/addresses`,
		);
	}

	createDestinationAddress(email: string) {
		if (!this.accountId) {
			throw new AppError(400, "CLOUDFLARE_ACCOUNT_ID is not configured.");
		}

		return this.request<CloudflareDestination>(
			`/accounts/${this.accountId}/email/routing/addresses`,
			{
				body: JSON.stringify({ email }),
				method: "POST",
			},
		);
	}

	getRoutingSettings(zoneId: string) {
		return this.request<CloudflareRoutingSettings>(`/zones/${zoneId}/email/routing`);
	}

	getCatchAllRule(zoneId: string) {
		return this.request<CloudflareCatchAll>(`/zones/${zoneId}/email/routing/rules/catch_all`);
	}

	updateCatchAllToWorker(zoneId: string, workerName: string) {
		return this.request<CloudflareCatchAll>(`/zones/${zoneId}/email/routing/rules/catch_all`, {
			body: JSON.stringify({
				actions: [
					{
						type: "worker",
						// Inference from Cloudflare's rules API model: action values are string arrays.
						value: [workerName],
					},
				],
				matchers: [{ type: "all" }],
				enabled: true,
				name: "Mail Bin catch-all",
			}),
			method: "PUT",
		});
	}
}

function mapCloudflareStatus(status?: string): "active" | "pending" | "misconfigured" {
	if (status === "ready") {
		return "active";
	}

	if (status?.startsWith("misconfigured")) {
		return "misconfigured";
	}

	return "pending";
}

export function createCloudflareBackedDestination(env: AppBindings, email: string) {
	const client = new CloudflareEmailRoutingClient(env);
	return client.createDestinationAddress(email);
}

export async function syncCloudflareState(env: AppBindings): Promise<CloudflareSyncSummary> {
	const db = getDb(env);
	const client = new CloudflareEmailRoutingClient(env);
	const remoteDestinations = await client.listDestinationAddresses();

	for (const destination of remoteDestinations) {
		await upsertDestinationFromCloudflare(db, {
			cloudflareDestinationId: destination.id,
			email: destination.email.toLowerCase(),
			verifiedAt: destination.verified ? new Date(destination.verified) : null,
		});
	}

	const localDomains = await listDomains(db);
	const syncedDomains: CloudflareSyncSummary["domains"] = [];

	for (const domain of localDomains) {
		const settings = await client.getRoutingSettings(domain.zoneId);
		let catchAll = await client.getCatchAllRule(domain.zoneId);

		if (env.CLOUDFLARE_EMAIL_WORKER_NAME) {
			const currentWorker = catchAll.actions?.find((action) => action.type === "worker")
				?.value?.[0];

			if (!catchAll.enabled || currentWorker !== env.CLOUDFLARE_EMAIL_WORKER_NAME) {
				catchAll = await client.updateCatchAllToWorker(
					domain.zoneId,
					env.CLOUDFLARE_EMAIL_WORKER_NAME,
				);
			}
		}

		const mappedStatus = mapCloudflareStatus(settings.status);
		await updateDomainStatus(db, domain.id, mappedStatus);

		syncedDomains.push({
			catchAllAction: catchAll.actions?.[0]?.type ?? null,
			fqdn: domain.fqdn,
			routingEnabled: settings.enabled,
			status: mappedStatus,
		});
	}

	return {
		domains: syncedDomains,
		syncedDestinations: remoteDestinations.length,
		syncedDomains: syncedDomains.length,
	};
}
