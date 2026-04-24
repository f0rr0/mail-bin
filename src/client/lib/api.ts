import { hc } from "hono/client";

import type { AppType } from "@/server/http/app";
import type {
	Alias,
	CloudflareSyncSummary,
	CreateAliasInput,
	CreateDestinationInput,
	CreateDomainInput,
	DeliveryEvent,
	Domain,
	Destination,
	UpdateAliasInput,
} from "@/shared/schemas";

const client = hc<AppType>(
	typeof window === "undefined" ? "http://localhost" : window.location.origin,
);

interface ErrorPayload {
	message?: string;
}

interface ResponseLike {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}

async function unwrapJson<T>(responsePromise: Promise<ResponseLike>) {
	const response = await responsePromise;
	let payload: unknown = null;

	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		const message =
			typeof payload === "object" &&
			payload !== null &&
			"message" in payload &&
			typeof (payload as ErrorPayload).message === "string"
				? (payload as ErrorPayload).message
				: `Request failed with ${response.status}`;
		throw new Error(message);
	}

	return payload as T;
}

export const queryKeys = {
	aliases: ["aliases"] as const,
	destinations: ["destinations"] as const,
	domains: ["domains"] as const,
	events: ["events"] as const,
};

export const api = {
	createAlias(input: CreateAliasInput) {
		return unwrapJson<Alias>(client.api.aliases.$post({ json: input }));
	},
	createDestination(input: CreateDestinationInput) {
		return unwrapJson<Destination>(client.api.destinations.$post({ json: input }));
	},
	createDomain(input: CreateDomainInput) {
		return unwrapJson<Domain>(client.api.domains.$post({ json: input }));
	},
	disableAlias(id: string) {
		return unwrapJson<Alias>(
			client.api.aliases[":id"].disable.$post({
				param: { id },
			}),
		);
	},
	listAliases() {
		return unwrapJson<Alias[]>(client.api.aliases.$get());
	},
	listDestinations() {
		return unwrapJson<Destination[]>(client.api.destinations.$get());
	},
	listDomains() {
		return unwrapJson<Domain[]>(client.api.domains.$get());
	},
	listEvents() {
		return unwrapJson<DeliveryEvent[]>(client.api.events.$get());
	},
	syncCloudflare() {
		return unwrapJson<CloudflareSyncSummary>(client.api.sync.cloudflare.$post());
	},
	updateAlias(input: UpdateAliasInput) {
		return unwrapJson<Alias>(client.api.aliases.$patch({ json: input }));
	},
};
