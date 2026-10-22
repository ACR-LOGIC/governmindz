
import { randomUUID } from "node:crypto";
import { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import { formatZetarisResult } from "./format.js";
import { zetarisQueryHandler } from "./tools/zetaris.tools.js";

async function query(sql: string, limit = 20): Promise<{
	columns: string[];
	rows: unknown[][];
	total?: number;
}> {
	return (await zetarisQueryHandler(
		{ query: sql, limit },
		{ callerRole: "analyst", correlationId: randomUUID() },
	)) as { columns: string[]; rows: unknown[][]; total?: number };
}

async function main(): Promise<number> {
	let failures = 0;
	const requireMeterless = process.argv.includes("--require-meterless");
	const provider = new MeterlessProvider();

	console.log("Environment:");
	for (const name of [
		"AUDIT_TRAIL_SECRET",
		"KMS_MASTER_KEY",
		"ZETARIS_API_KEY",
		"ZETARIS_ORG_ID",
		"ZETARIS_REST_URL",
	]) {
		console.log(`  ${name}: ${process.env[name] ? "set" : "missing"}`);
	}
	console.log(`  Meterless token: ${provider.hasToken() ? "set" : "missing"}`);
	console.log(`  Meterless model: ${provider.model}`);
	console.log(
		`  Meterless seat model: ${process.env.METERLESS_SEAT_MODEL?.trim() || provider.model}`,
	);

	console.log("\nZetaris SELECT 1:");
	try {
		const result = await query("SELECT 1");
		const value = result.rows[0]?.[0];
		const ok = String(value) === "1";
		console.log(`  ${ok ? "PASS" : "FAIL"}: SELECT 1 -> ${String(value)}`);
		if (!ok) {
			console.log(formatZetarisResult(result));
			failures += 1;
		}
	} catch (error) {
		failures += 1;
		console.log(
			`  FAIL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	console.log("\nZetaris SHOW LIGHTNING DATABASES:");
	try {
		const result = await query("SHOW LIGHTNING DATABASES");
		console.log(formatZetarisResult(result));
		if (result.rows.length === 0) {
			console.log("  WARN: no Lightning databases returned");
		}
	} catch (error) {
		failures += 1;
		console.log(
			`  FAIL: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	console.log("\nMeterless Runtime:");
	if (process.argv.includes("--auto-detect")) {
		const detected = await provider.autoDetect();
		if (!detected) {
			console.log("  auto detect: no runtime found on known local ports");
		}
	}
	const status = await provider.status();
	console.log(`  state: ${status.state}`);
	console.log(`  baseUrl: ${status.baseUrl}`);
	if (status.reason) console.log(`  reason: ${status.reason}`);
	if (status.models?.length) console.log(`  models: ${status.models.join(", ")}`);
	if (requireMeterless && status.state !== "online") failures += 1;

	console.log(
		`\nSmoke result: ${failures === 0 ? "PASS" : `FAIL (${failures} failure${failures === 1 ? "" : "s"})`}`,
	);
	return failures === 0 ? 0 : 1;
}

main()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
