import { defineConfig } from "oxlint";

import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
	extends: [core, react, vitest],
	ignorePatterns: ["tranquilo/**", "worker-configuration.d.ts"],
	overrides: [
		{
			files: ["src/client/dashboard.tsx"],
			rules: {
				complexity: "off",
			},
		},
		{
			files: ["test/env.d.ts"],
			rules: {
				"typescript/no-empty-interface": "off",
				"typescript/no-empty-object-type": "off",
			},
		},
	],
	rules: {
		"func-style": "off",
		"import/no-unassigned-import": "off",
		"jsx-a11y/prefer-tag-over-role": "off",
		"no-use-before-define": "off",
		"promise/prefer-await-to-callbacks": "off",
		"sort-keys": "off",
		"typescript/await-thenable": "off",
		"typescript/no-confusing-void-expression": "off",
		"typescript/no-deprecated": "off",
		"typescript/no-misused-promises": "off",
		"typescript/no-misused-spread": "off",
		"typescript/no-unsafe-argument": "off",
		"typescript/no-unsafe-assignment": "off",
		"typescript/no-unsafe-call": "off",
		"typescript/no-unsafe-member-access": "off",
		"typescript/no-unsafe-return": "off",
		"typescript/no-unsafe-type-assertion": "off",
		"typescript/prefer-nullish-coalescing": "off",
		"typescript/prefer-readonly-parameter-types": "off",
		"typescript/prefer-regexp-exec": "off",
		"typescript/promise-function-async": "off",
		"typescript/strict-boolean-expressions": "off",
		"typescript/strict-void-return": "off",
		"typescript/switch-exhaustiveness-check": "off",
		"typescript/unbound-method": "off",
	},
});
