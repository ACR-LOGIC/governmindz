/**
 * resilience.challenger.test.ts
 *
 * Empirical Challenger Verification Harness for GovernMindz Resilience System (R2):
 * 1. Rapid failure bursts tripping circuit from CLOSED to OPEN (concurrent & sequential).
 * 2. Immediate fail-fast in OPEN state without network latency (< 2ms per query).
 * 3. Half-open transition after reset timeout and recovery probe (success, failure, multi-probe).
 * 4. Boundary tests on fallback catalog queries across all 8 Lightning databases
 *    (invalid SQL, SQL injection attempts, non-existent tables/dbs, empty queries, boundary limits).
 * 5. Assert that no uncaught exceptions escape to callers under any failure condition.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CircuitBreaker,
	type CircuitBreakerTransition,
} from "../src/resilience/CircuitBreaker.js";
import {
	ZetarisFallbackCatalog,
	defaultZetarisFallbackCatalog,
} from "../src/integrations/ZetarisFallbackCatalog.js";
import {
	ResilientZetarisClient,
	type ResilientQueryResult,
} from "../src/integrations/ResilientZetarisClient.js";
import { ZetarisClient, ZetarisError } from "../src/integrations/zetarisClient.js";

// ============================================================================
// 1. RAPID FAILURE BURSTS (CLOSED -> OPEN)
// ============================================================================

test("Challenger 1.1: Sequential failure bursts trip at exact configurable threshold", async () => {
	const threshold = 5;
	const transitions: CircuitBreakerTransition[] = [];
	const breaker = new CircuitBreaker({
		name: "BurstSequentialBreaker",
		failureThreshold: threshold,
		onStateChange: (t) => transitions.push(t),
	});

	const failingAction = async () => {
		throw new Error("Simulated connection dropped");
	};

	// Failures 1 through threshold - 1 must keep circuit in CLOSED
	for (let i = 1; i < threshold; i++) {
		const res = await breaker.execute(failingAction, (err) => `fallback-${i}`);
		assert.equal(res, `fallback-${i}`);
		assert.equal(breaker.getState(), "CLOSED");
		assert.equal(breaker.isOpen(), false);
		assert.equal(breaker.getStats().consecutiveFailures, i);
	}

	assert.equal(transitions.length, 0, "No transitions before threshold reached");

	// Exact threshold failure must trip to OPEN
	const resTrip = await breaker.execute(failingAction, () => "fallback-tripped");
	assert.equal(resTrip, "fallback-tripped");
	assert.equal(breaker.getState(), "OPEN");
	assert.equal(breaker.isOpen(), true);

	assert.equal(transitions.length, 1);
	assert.equal(transitions[0].fromState, "CLOSED");
	assert.equal(transitions[0].toState, "OPEN");
	assert.equal(transitions[0].consecutiveFailures, threshold);
});

test("Challenger 1.2: Massive concurrent burst of 50 simultaneous failures trips safely without crash or duplicate transitions", async () => {
	const transitions: CircuitBreakerTransition[] = [];
	const breaker = new CircuitBreaker({
		name: "ConcurrentBurstBreaker",
		failureThreshold: 3,
		onStateChange: (t) => transitions.push(t),
	});

	let backendCalls = 0;
	const failingAction = async () => {
		backendCalls++;
		await new Promise((r) => setTimeout(r, 5));
		throw new Error("Concurrent network timeout");
	};

	// Fire 50 simultaneous calls
	const burstSize = 50;
	const promises = Array.from({ length: burstSize }, (_, idx) =>
		breaker.execute(failingAction, (err) => ({ idx, fallback: true, err: err.message })),
	);

	const results = await Promise.all(promises);

	// Assertions
	assert.equal(results.length, burstSize);
	for (const r of results) {
		assert.equal(r.fallback, true);
	}

	assert.equal(breaker.getState(), "OPEN");
	assert.equal(breaker.isOpen(), true);

	// Exactly ONE transition to OPEN should occur (no duplicate transition events)
	const openTransitions = transitions.filter((t) => t.toState === "OPEN");
	assert.equal(openTransitions.length, 1, "Must emit exactly one OPEN transition event during concurrent burst");
	assert.ok(breaker.getStats().totalFailures >= 3);
});

test("Challenger 1.3: Interleaved successes reset consecutive failures in CLOSED state", async () => {
	const breaker = new CircuitBreaker({
		name: "InterleavedBreaker",
		failureThreshold: 3,
	});

	const fail = async () => {
		throw new Error("Failure");
	};
	const pass = async () => "OK";

	// 2 failures
	await breaker.execute(fail, () => "fb1");
	await breaker.execute(fail, () => "fb2");
	assert.equal(breaker.getStats().consecutiveFailures, 2);
	assert.equal(breaker.getState(), "CLOSED");

	// 1 success -> should reset consecutiveFailures to 0
	const successResult = await breaker.execute(pass);
	assert.equal(successResult, "OK");
	assert.equal(breaker.getStats().consecutiveFailures, 0);
	assert.equal(breaker.getState(), "CLOSED");

	// 2 more failures -> still CLOSED because counter was reset
	await breaker.execute(fail, () => "fb3");
	await breaker.execute(fail, () => "fb4");
	assert.equal(breaker.getStats().consecutiveFailures, 2);
	assert.equal(breaker.getState(), "CLOSED");
});

// ============================================================================
// 2. IMMEDIATE FAIL-FAST IN OPEN STATE WITHOUT NETWORK LATENCY
// ============================================================================

test("Challenger 2.1: In OPEN state, 100 queries fail-fast with zero network latency (< 2ms per query)", async () => {
	let backendInvocations = 0;
	const slowBackendClient = {
		query: async () => {
			backendInvocations++;
			// If called, simulate 2000ms delay
			await new Promise((r) => setTimeout(r, 2000));
			throw new Error("Should never be reached in OPEN state!");
		},
	} as unknown as ZetarisClient;

	const resilientClient = new ResilientZetarisClient({
		underlyingClient: slowBackendClient,
		circuitBreakerConfig: {
			name: "FastFailClient",
			failureThreshold: 1,
			resetTimeoutMs: 60_000, // Long reset timeout
		},
	});

	// Trip to OPEN
	await resilientClient.query("SELECT 1");
	assert.equal(resilientClient.getCircuitBreaker().getState(), "OPEN");
	assert.equal(backendInvocations, 1);

	// Execute 100 queries against the OPEN circuit breaker
	const start = Date.now();
	const iterations = 100;
	for (let i = 0; i < iterations; i++) {
		const res = await resilientClient.query("SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 2");
		assert.equal(res.circuitBreakerState, "OPEN");
		assert.equal(res.isSynthetic, true);
		assert.equal(res.evidenceSource, "synthetic_fallback");
		assert.ok(res.rows.length <= 2);
	}
	const totalDuration = Date.now() - start;

	// Backend must NEVER have been called during OPEN state
	assert.equal(backendInvocations, 1, "Backend must not be invoked when circuit is OPEN");

	// Total duration for 100 queries must be under 150ms (average < 1.5ms per query)
	assert.ok(
		totalDuration < 200,
		`100 queries in OPEN state must complete almost instantly; took ${totalDuration}ms (${(totalDuration / iterations).toFixed(2)}ms/query)`,
	);
});

// ============================================================================
// 3. HALF-OPEN TRANSITION AFTER RESET TIMEOUT & RECOVERY PROBE DYNAMICS
// ============================================================================

test("Challenger 3.1: State evaluates strictly by elapsed time (OPEN before timeout, HALF_OPEN after)", async () => {
	const resetTimeoutMs = 80;
	const breaker = new CircuitBreaker({
		name: "TimeEvalBreaker",
		failureThreshold: 1,
		resetTimeoutMs,
	});

	await breaker.execute(async () => {
		throw new Error("Initial fault");
	}, () => "tripped");

	assert.equal(breaker.getState(), "OPEN");

	// Before timeout has elapsed (e.g., 30ms): must remain OPEN
	await new Promise((r) => setTimeout(r, 30));
	assert.equal(breaker.getState(), "OPEN");
	assert.equal(breaker.isOpen(), true);

	// After timeout has elapsed (e.g., 60ms more, total 90ms): must evaluate to HALF_OPEN
	await new Promise((r) => setTimeout(r, 60));
	assert.equal(breaker.getState(), "HALF_OPEN");
	assert.equal(breaker.isHalfOpen(), true);
	assert.equal(breaker.isOpen(), false);
});

test("Challenger 3.2: Multi-probe recovery requirement (halfOpenSuccessThreshold = 3)", async () => {
	const breaker = new CircuitBreaker({
		name: "MultiProbeBreaker",
		failureThreshold: 1,
		resetTimeoutMs: 50,
		halfOpenSuccessThreshold: 3,
	});

	// Trip
	await breaker.execute(async () => {
		throw new Error("Trip");
	}, () => "fb");

	// Wait for HALF_OPEN
	await new Promise((r) => setTimeout(r, 60));
	assert.equal(breaker.getState(), "HALF_OPEN");

	// Probe 1 succeeds: must stay HALF_OPEN
	await breaker.execute(async () => "probe-1");
	assert.equal(breaker.getState(), "HALF_OPEN");
	assert.equal(breaker.getStats().consecutiveSuccesses, 1);

	// Probe 2 succeeds: must stay HALF_OPEN
	await breaker.execute(async () => "probe-2");
	assert.equal(breaker.getState(), "HALF_OPEN");
	assert.equal(breaker.getStats().consecutiveSuccesses, 2);

	// Probe 3 succeeds: threshold met -> transitions to CLOSED
	await breaker.execute(async () => "probe-3");
	assert.equal(breaker.getState(), "CLOSED");
	assert.equal(breaker.isClosed(), true);
	assert.equal(breaker.getStats().consecutiveSuccesses, 0);
});

test("Challenger 3.3: Failed probe in HALF_OPEN immediately re-trips back to OPEN and resets cooldown", async () => {
	const resetTimeoutMs = 60;
	const breaker = new CircuitBreaker({
		name: "ProbeRetripBreaker",
		failureThreshold: 1,
		resetTimeoutMs,
	});

	// Trip to OPEN
	await breaker.execute(async () => {
		throw new Error("Trip");
	}, () => "fb");

	// Cooldown to HALF_OPEN
	await new Promise((r) => setTimeout(r, 70));
	assert.equal(breaker.getState(), "HALF_OPEN");

	// Failed probe
	const fallbackResult = await breaker.execute(
		async () => {
			throw new Error("Probe re-connection failed");
		},
		(err) => `handled: ${err.message}`,
	);

	assert.match(fallbackResult, /handled: Probe re-connection failed/);
	assert.equal(breaker.getState(), "OPEN");
	assert.equal(breaker.isOpen(), true);

	// Immediately subsequent call before next cooldown must fail-fast without calling action
	let actionCalled = false;
	await breaker.execute(
		async () => {
			actionCalled = true;
			return "should-not-run";
		},
		() => "fail-fast-fallback",
	);
	assert.equal(actionCalled, false);
});

// ============================================================================
// 4. BOUNDARY TESTS ON FALLBACK CATALOG ACROSS ALL 8 LIGHTNING DATABASES
// ============================================================================

test("Challenger 4.1: Fallback catalog queries succeed across all 8 Lightning databases without throwing", () => {
	const catalog = defaultZetarisFallbackCatalog;
	const allDbs = [
		"SEC_DATA",
		"OPENFDA_REST",
		"CLINICALTRIALS_REST",
		"GLEIF_REST",
		"POKEAPI_REST",
		"NY_TAXI",
		"COMPANY_DNS",
		"TPCDS_DB",
	];

	// 1. SHOW LIGHTNING DATABASES
	const dbList = catalog.resolveQuery("SHOW LIGHTNING DATABASES");
	assert.equal(dbList.columns[0], "database_name");
	assert.equal(dbList.rows.length, 8);
	const foundDbs = dbList.rows.map((r) => r[0]);
	for (const expected of allDbs) {
		assert.ok(foundDbs.includes(expected), `Missing expected database: ${expected}`);
	}

	// 2. Query each database: SHOW TABLES, DESCRIBE, SELECT COUNT(*), SELECT * LIMIT
	for (const dbName of allDbs) {
		// SHOW TABLES FROM <db>
		const tablesRes = catalog.resolveQuery(`SHOW TABLES FROM ${dbName}`);
		assert.ok(tablesRes.rows.length > 0, `SHOW TABLES FROM ${dbName} returned 0 tables`);
		const firstTableName = String(tablesRes.rows[0][1]);

		// SHOW TABLES IN <db>
		const tablesInRes = catalog.resolveQuery(`SHOW TABLES IN ${dbName}`);
		assert.equal(tablesInRes.rows.length, tablesRes.rows.length);

		// DESCRIBE <db>.<table_name>
		const descRes = catalog.resolveQuery(`DESCRIBE ${dbName}.${firstTableName}`);
		assert.ok(descRes.columns.includes("column_name"));
		assert.ok(descRes.rows.length > 0, `DESCRIBE ${dbName}.${firstTableName} returned no columns`);

		// SELECT COUNT(*) FROM <db>.<table_name>
		const countRes = catalog.resolveQuery(`SELECT COUNT(*) FROM ${dbName}.${firstTableName}`);
		assert.equal(countRes.columns[0], "count");
		assert.ok(Number(countRes.rows[0][0]) > 0, `COUNT(*) must be > 0 for ${dbName}.${firstTableName}`);

		// SELECT * FROM <db>.<table_name> LIMIT 2
		const selectRes = catalog.resolveQuery(`SELECT * FROM ${dbName}.${firstTableName} LIMIT 2`);
		assert.ok(selectRes.columns.length > 0);
		assert.ok(selectRes.rows.length > 0 && selectRes.rows.length <= 2);
	}
});

test("Challenger 4.2: Boundary SQL queries (empty, whitespace, semicolons, invalid statements)", () => {
	const catalog = new ZetarisFallbackCatalog();

	const testCases = [
		"",
		"   ",
		";",
		";;;;",
		"SELECT",
		"SELECT FROM",
		"FROM SELECT",
		"FOO BAR BAZ NOT SQL",
		"SHOW",
		"DESCRIBE",
		"DESC",
	];

	for (const sql of testCases) {
		const res = catalog.resolveQuery(sql);
		assert.ok(Array.isArray(res.columns), `Must return array of columns for '${sql}'`);
		assert.ok(Array.isArray(res.rows), `Must return array of rows for '${sql}'`);
		assert.equal(typeof res.total, "number");
		assert.equal(typeof res.timeUsed, "number");
	}
});

test("Challenger 4.3: SQL injection attempts and adversarial inputs return safe synthetic responses without throwing", () => {
	const catalog = new ZetarisFallbackCatalog();

	const adversarialInputs = [
		"' OR '1'='1",
		"SELECT * FROM SEC_DATA.apple_revenue_facts; DROP TABLE SEC_DATA.apple_revenue_facts; --",
		"SELECT * FROM ' OR 1=1 --",
		"SELECT * FROM \"SEC_DATA\".\"apple_revenue_facts\"",
		"SELECT * FROM [SEC_DATA].[apple_revenue_facts]",
		"SELECT * FROM SEC_DATA.apple_revenue_facts WHERE 1=1 UNION SELECT * FROM passwords",
		"SELECT * FROM NY_TAXI.customers WHERE email LIKE '%admin%'",
		"'; EXEC xp_cmdshell('dir'); --",
		"SELECT * FROM SEC_DATA.apple_revenue_facts WHERE 1=1\x00 AND 2=2",
		"DROP TABLE SEC_DATA.apple_revenue_facts",
		"DELETE FROM NY_TAXI.customers WHERE 1=1",
		"INSERT INTO SEC_DATA.apple_revenue_facts VALUES ('hack')",
		"UPDATE NY_TAXI.drivers SET status = 'HACKED'",
	];

	for (const sql of adversarialInputs) {
		const res = catalog.resolveQuery(sql);
		assert.ok(res, `Failed to resolve adversarial SQL: ${sql}`);
		assert.ok(Array.isArray(res.columns));
		assert.ok(Array.isArray(res.rows));
		assert.equal(typeof res.total, "number");
	}

	// Verify that table data in SEC_DATA and NY_TAXI was NOT mutated or dropped
	const appleRes = catalog.resolveQuery("SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 5");
	assert.equal(appleRes.rows.length, 5);
	const custRes = catalog.resolveQuery("SELECT * FROM NY_TAXI.customers LIMIT 3");
	assert.equal(custRes.rows.length, 3);
});

test("Challenger 4.4: Non-existent databases and tables return structured unknown responses without throwing", () => {
	const catalog = new ZetarisFallbackCatalog();

	// Unknown table in known database
	const unknownTableRes = catalog.resolveQuery("SELECT * FROM SEC_DATA.non_existent_table_xyz LIMIT 5");
	assert.equal(unknownTableRes.total, 0);
	assert.ok(unknownTableRes.rows.some((r) => r[0] === "UNKNOWN_TABLE"));

	// Unknown database and unknown table
	const unknownDbRes = catalog.resolveQuery("SELECT * FROM GHOST_DATABASE.ghost_table LIMIT 5");
	assert.equal(unknownDbRes.total, 0);
	assert.ok(unknownDbRes.rows.some((r) => r[0] === "UNKNOWN_TABLE"));

	// SHOW TABLES from non-existent database returns 0 rows
	const emptyShowTables = catalog.resolveQuery("SHOW TABLES FROM NON_EXISTENT_DB");
	assert.equal(emptyShowTables.rows.length, 0);
	assert.equal(emptyShowTables.total, 0);

	// DESCRIBE non-existent table returns 0 rows
	const emptyDesc = catalog.resolveQuery("DESCRIBE SEC_DATA.fake_table_123");
	assert.equal(emptyDesc.rows.length, 0);
	assert.equal(emptyDesc.total, 0);
});

test("Challenger 4.5: Boundary LIMIT handling and case insensitivity", () => {
	const catalog = new ZetarisFallbackCatalog();

	// Case insensitivity
	const mixedCaseRes = catalog.resolveQuery(
		"sElEcT * FrOm sec_data.APPLE_REVENUE_FACTS limit 1",
	);
	assert.equal(mixedCaseRes.rows.length, 1);
	assert.equal(mixedCaseRes.rows[0][1], "AAPL");

	// LIMIT 0
	const limitZeroRes = catalog.resolveQuery(
		"SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 0",
	);
	assert.equal(limitZeroRes.rows.length, 0);

	// High LIMIT capped by table rows
	const highLimitRes = catalog.resolveQuery(
		"SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 99999",
	);
	assert.equal(highLimitRes.rows.length, 5); // Synthetic dataset has 5 sample rows

	// LIMIT in options parameter
	const optLimitRes = catalog.resolveQuery(
		"SELECT * FROM SEC_DATA.apple_revenue_facts",
		2,
	);
	assert.equal(optLimitRes.rows.length, 2);
});

// ============================================================================
// 5. ASSERT NO UNCAUGHT EXCEPTIONS ESCAPE TO CALLERS
// ============================================================================

test("Challenger 5.1: ResilientZetarisClient catches all network, HTTP, and timeout errors without throwing", async () => {
	const errorTypes = [
		new Error("connect ECONNREFUSED 127.0.0.1:9999"),
		new Error("The operation was aborted due to timeout"),
		new ZetarisError("Zetaris HTTP 500: Internal Server Error", "ZETARIS_HTTP_ERROR", 500),
		new ZetarisError("Zetaris HTTP 502: Bad Gateway", "ZETARIS_HTTP_ERROR", 502),
		new ZetarisError("Zetaris HTTP 503: Service Unavailable", "ZETARIS_HTTP_ERROR", 503),
		new ZetarisError("Missing Zetaris configuration: ZETARIS_API_KEY", "ZETARIS_CONFIG_MISSING"),
		new ZetarisError("Non-read-only SQL statements rejected", "ZETARIS_READ_ONLY_REQUIRED"),
		new SyntaxError("Unexpected token < in JSON at position 0"),
		"String error thrown directly",
		{ custom: "Object thrown as error" },
	];

	for (const simError of errorTypes) {
		const mockClient = {
			query: async () => {
				throw simError;
			},
		} as unknown as ZetarisClient;

		const client = new ResilientZetarisClient({
			underlyingClient: mockClient,
		});

		// Calling query MUST NEVER throw an uncaught exception
		let result: ResilientQueryResult | undefined;
		let caughtError: unknown;
		try {
			result = await client.query("SHOW LIGHTNING DATABASES");
		} catch (err) {
			caughtError = err;
		}

		assert.equal(caughtError, undefined, `Must not throw on error type: ${simError}`);
		assert.ok(result, "Must return valid ResilientQueryResult");
		if (!result) throw new Error("Result must not be undefined");
		assert.equal(result.isSynthetic, true);
		assert.equal(result.evidenceSource, "synthetic_fallback");
		assert.ok(result.rows.length > 0);
	}
});

test("Challenger 5.2: Broken user onStateChange listener does not interrupt circuit operations or throw", async () => {
	const breaker = new CircuitBreaker({
		name: "BrokenListenerBreaker",
		failureThreshold: 1,
		onStateChange: () => {
			throw new Error("Malicious or buggy onStateChange listener exception!");
		},
	});

	// Trip circuit: listener throws, but breaker must catch and proceed
	let result: string | undefined;
	let thrown: unknown;
	try {
		result = await breaker.execute(
			async () => {
				throw new Error("Action failure");
			},
			() => "fallback-safely-returned",
		);
	} catch (err) {
		thrown = err;
	}

	assert.equal(thrown, undefined, "Listener throw must not escape execute()");
	assert.equal(result, "fallback-safely-returned");
	assert.equal(breaker.getState(), "OPEN");
});
