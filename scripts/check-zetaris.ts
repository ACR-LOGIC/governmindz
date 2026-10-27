import { sharedResilientZetarisClient } from "../libs/core/src/integrations/ResilientZetarisClient.js";

const query = process.env.ZETARIS_DEMO_QUERY?.trim() || "SHOW LIGHTNING DATABASES";

async function main(): Promise<void> {
	const result = await sharedResilientZetarisClient.query(query, {
		limit: 50,
		timeoutMs: 20_000,
	});

	const summary = {
		query,
		columns: result.columns,
		rows: result.rowCount,
		total: result.total,
		source: result.evidenceSource,
		synthetic: result.isSynthetic,
		circuitBreakerState: result.circuitBreakerState,
		fallbackReason: result.fallbackReason,
	};

	console.log(JSON.stringify(summary, null, 2));

	if (result.isSynthetic) {
		console.error(
			"Zetaris check FAILED: the client returned synthetic fallback data. Live queries are not enabled.",
		);
		process.exitCode = 1;
		return;
	}

	console.log("Zetaris check PASSED: live read-only query returned non-synthetic data.");
}

main().catch((error: unknown) => {
	console.error(
		"Zetaris check FAILED:",
		error instanceof Error ? error.message : String(error),
	);
	process.exitCode = 1;
});
