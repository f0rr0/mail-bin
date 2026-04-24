import { drizzle } from "drizzle-orm/d1";

import type { AppBindings } from "@/server/app-env";

export function getDb(env: Pick<AppBindings, "DB">) {
	return drizzle(env.DB);
}

export type AppDb = ReturnType<typeof getDb>;
