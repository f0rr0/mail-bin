import { writeFileSync } from "node:fs";

const semverPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const branchPattern = /^[A-Za-z0-9._/-]+$/;

function clean(value: string | undefined) {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: string | undefined, fallback = false) {
	const normalized = clean(value)?.toLowerCase();

	if (!normalized) {
		return fallback;
	}

	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}

	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}

	throw new Error(`Invalid boolean value: ${value}`);
}

function normalizeTag(value: string | undefined, label: string) {
	const rawValue = clean(value);

	if (!rawValue) {
		throw new Error(`${label} is required.`);
	}

	const version = rawValue.startsWith("v") ? rawValue.slice(1) : rawValue;

	if (!semverPattern.test(version)) {
		throw new Error(`${label} must be a semantic version like 0.1.0, v0.1.0, or 1.0.0-beta.1.`);
	}

	return {
		tagName: `v${version}`,
		version,
	};
}

function validateTargetBranch(value: string | undefined) {
	const targetBranch = clean(value) ?? "main";

	if (
		targetBranch.startsWith("-") ||
		targetBranch.includes("..") ||
		targetBranch.includes("//") ||
		targetBranch.endsWith("/") ||
		!branchPattern.test(targetBranch)
	) {
		throw new Error(`Invalid target branch: ${targetBranch}`);
	}

	return targetBranch;
}

function writeOutput(name: string, value: string | boolean) {
	const line = `${name}=${String(value)}\n`;

	if (process.env.GITHUB_OUTPUT) {
		writeFileSync(process.env.GITHUB_OUTPUT, line, { flag: "a" });
		return;
	}

	console.log(line.trimEnd());
}

const eventName = clean(process.env.GITHUB_EVENT_NAME) ?? "workflow_dispatch";
const isManualRelease = eventName === "workflow_dispatch";
const releaseSource = isManualRelease ? process.env.RELEASE_VERSION : process.env.GITHUB_REF_NAME;
const { tagName, version } = normalizeTag(
	releaseSource,
	isManualRelease ? "Release version" : "Release tag",
);

const targetBranch = validateTargetBranch(process.env.RELEASE_TARGET_BRANCH);
const prerelease = readBoolean(process.env.RELEASE_PRERELEASE) || version.includes("-");
const draft = readBoolean(process.env.RELEASE_DRAFT);

writeOutput("draft", draft);
writeOutput("prerelease", prerelease);
writeOutput("tag_name", tagName);
writeOutput("target_branch", targetBranch);
writeOutput("version", version);
