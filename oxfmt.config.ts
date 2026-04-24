import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
	extends: [ultracite],
	ignorePatterns: ["tranquilo/**", "worker-configuration.d.ts"],
});
