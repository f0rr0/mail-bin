export interface AppBindings {
	ASSETS: Fetcher;
	DB: D1Database;
	APP_NAME: string;
	APP_ENV: string;
	CLOUDFLARE_API_TOKEN?: string;
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_EMAIL_WORKER_NAME?: string;
}
