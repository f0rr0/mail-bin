import { createApiApp } from "@/server/http/app";
import { handleIncomingEmail } from "@/server/mail/handler";
import type { AppBindings } from "@/server/app-env";

const apiApp = createApiApp();

export type AppType = typeof apiApp;

export default {
	async email(
		message: ForwardableEmailMessage,
		env: AppBindings,
		_executionContext: ExecutionContext,
	) {
		await handleIncomingEmail(message, env);
	},

	fetch(
		request: Request,
		env: AppBindings,
		executionContext: ExecutionContext,
	): Promise<Response> | Response {
		const url = new URL(request.url);

		if (url.pathname === "/health") {
			return Response.json({
				environment: env.APP_ENV,
				name: env.APP_NAME,
				ok: true,
			});
		}

		if (url.pathname.startsWith("/api")) {
			return apiApp.fetch(request, env, executionContext);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<AppBindings>;
