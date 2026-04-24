export const testAssetFetcher = {
	connect(): Socket {
		throw new Error("ASSETS.connect is not implemented in tests.");
	},
	fetch() {
		return Promise.resolve(new Response("not found", { status: 404 }));
	},
} satisfies Fetcher;
