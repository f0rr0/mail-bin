import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { resolveWranglerConfigPath } from "./scripts/lib/wrangler-config";

export default defineConfig({
	build: {
		emptyOutDir: true,
		outDir: "dist/client",
	},
	plugins: [react(), tailwindcss(), cloudflare({ configPath: resolveWranglerConfigPath() })],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("src", import.meta.url)),
		},
	},
});
