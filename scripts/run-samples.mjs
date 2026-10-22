import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const inputDir = path.join(root, "input_examples");
const outputDir = path.join(root, "output_examples");
const logDir = path.join(root, "logs");

mkdirSync(outputDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const files = readdirSync(inputDir)
	.filter((name) => name.endsWith(".json"))
	.sort();

if (files.length === 0) {
	console.error("No sample scenarios found in input_examples/.");
	process.exit(1);
}

for (const file of files) {
	const base = path.basename(file, ".json");
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "apps/gateway/src/sample.ts"],
		{
			cwd: root,
			stdio: "inherit",
			env: {
				...process.env,
				SAMPLE_SCENARIO: path.join("input_examples", file),
				SAMPLE_OUTPUT: path.join("output_examples", `${base}.json`),
				SAMPLE_LOG: path.join("logs", `${base}.jsonl`),
			},
		},
	);
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

console.log(`Generated ${files.length} sample outputs in output_examples/ and logs/.`);
