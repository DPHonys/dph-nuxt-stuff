import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import process from "node:process";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import antiSlopPlugin from "../index.ts";
import oxlintConfig from "../../../../oxlint.config.ts";

const pluginRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(pluginRoot, "../../..");
const fixture = join(pluginRoot, "test/fixtures/violations.ts");
// `oxlint` exports no bin subpath, so walk up from its manifest.
const oxlintBinary = join(
	dirname(createRequire(import.meta.url).resolve("oxlint/package.json")),
	"bin/oxlint",
);

const configuredRules = Object.keys(oxlintConfig.rules ?? {})
	.filter((rule) => rule.startsWith("anti-slop/"))
	.map((rule) => rule.slice("anti-slop/".length))
	.toSorted();

const registeredRules = Object.keys(antiSlopPlugin.rules).toSorted();

const temporaryRoots: string[] = [];
afterAll(() => {
	for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

/** Run oxlint with only the plugin's rules enabled and return the rule names it reported. */
function reportedRules(): string[] {
	const root = mkdtempSync(join(tmpdir(), "anti-slop-"));
	temporaryRoots.push(root);
	const config = join(root, "oxlint.json");
	writeFileSync(
		config,
		JSON.stringify({
			jsPlugins: [{ name: "anti-slop", specifier: join(pluginRoot, "index.ts") }],
			rules: Object.fromEntries(registeredRules.map((rule) => [`anti-slop/${rule}`, "error"])),
		}),
	);

	const result = spawnSync(
		process.execPath,
		[oxlintBinary, "-c", config, "-A", "all", "--format=json", fixture],
		{ cwd: repositoryRoot, encoding: "utf8", timeout: 60_000 },
	);
	if (result.error) throw result.error;
	let output: { diagnostics: { code: string }[] };
	try {
		output = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`oxlint produced no JSON report\nstdout: ${result.stdout}\nstderr: ${result.stderr}`, { cause: error });
	}
	const codes = output.diagnostics.map((diagnostic) => /^anti-slop\((.+)\)$/.exec(diagnostic.code)?.[1]);
	return [...new Set(codes)].filter((code) => code !== undefined).toSorted();
}

describe("anti-slop plugin", () => {
	it("registers exactly the rules the repository enables", () => {
		expect(registeredRules).toEqual(configuredRules);
	});

	it("reports every rule on the violations fixture", { timeout: 90_000 }, () => {
		expect(reportedRules()).toEqual(registeredRules);
	});
});
