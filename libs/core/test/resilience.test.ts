/**
 * resilience.test.ts
 *
 * Verifies Requirement R2 (F15, F16, F17):
 * - CircuitBreaker state transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
 * - Half-open probe re-trip on failure
 * - ZetarisFallbackCatalog schema & synthetic queries across all 8 databases
 * - ResilientZetarisClient offline daemon safety and transparent status flags
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { CircuitBreaker, type CircuitBreakerTransition } from "../src/resilience/CircuitBreaker.js";
import {
	ZetarisFallbackCatalog,
	defaultZetarisFallbackCatalog,
} from "../src/integrations/ZetarisFallbackCatalog.js";
import {
	ResilientZetarisClient,
} from "../src/integrations/ResilientZetarisClient.js";
import { ZetarisClient, ZetarisError } from "../src/integrations/zetarisClient.js";

test("CircuitBreaker: starts CLOSED and executes successful actions", async () => {
	const breaker = new CircuitBreaker({ name: "TestBreaker", failureThreshold: 3 });
	assert.equal(breaker.getState(), "CLOSED");
	assert.equal(breaker.isClosed(), true);
	assert.equal(breaker.isOpen(), false);

	const result = await breaker.execute(async () => 42);
	assert.equal(result, 42);
	assert.equal(breaker.getState(), "CLOSED");
	assert.equal(breaker.getStats().totalSuccesses, 1);
});

test("CircuitBreaker: trips from CLOSED to OPEN after failureThreshold failures", async () => {
	const transitions: CircuitBreakerTransition[] = [];
	const breaker = new CircuitBreaker({
		name: "TestBreaker",
		failureThreshold: 3,
		onStateChange: (t) => transitions.push(t),
	});

	const failingAction = async () => {
		throw new Error("Network unreachable");
	};

	// Failures 1 and 2: remain CLOSED, but fallback is called
	const f1 = await breaker.execute(failingAction, () => "fallback-1");
	assert.equal(f1, "fallback-1");
	assert.equal(breaker.getState(), "CLOSED");

	const f2 = await breaker.execute(failingAction, () => "fallback-2");
	assert.equal(f2, "fallback-2");
	assert.equal(breaker.getState(), "CLOSED");

	// Failure 3: reaches threshold -> trips to OPEN
	const f3 = await breaker.execute(failingAction, () => "fallback-3");
	assert.equal(f3, "fallback-3");
	assert.equal(breaker.getState(), "OPEN");
	assert.equal(breaker.isOpen(), true);

	// Verify transition event was emitted
	assert.equal(transitions.length, 1);
	assert.equal(transitions[0].fromState, "CLOSED");
	assert.equal(transitions[0].toState, "OPEN");
	assert.equal(transitions[0].consecutiveFailures, 3);
});

test("CircuitBreaker: fast-failover in OPEN state without calling action", async () => {
	let actionCallCount = 0;
	const breaker = new CircuitBreaker({ name: "FastFailBreaker", failureThreshold: 1 });

	// Trip to OPEN
	await breaker.execute(async () => {
		actionCallCount++;
		throw new Error("Initial failure");
	}, () => "tripped");

	assert.equal(breaker.getState(), "OPEN");
	assert.equal(actionCallCount, 1);

	// In OPEN state, action is NOT invoked
	const fallbackResult = await breaker.execute(async () => {
		actionCallCount++;
		return "should not run";
	}, (err) => `handled: ${err.message}`);

	assert.match(fallbackResult, /handled: Circuit breaker .* is OPEN/);
	assert.equal(actionCallCount, 1, "Action must not be called when circuit is OPEN");
});

test("CircuitBreaker: transitions OPEN -> HALF_OPEN -> CLOSED on successful probe", async () => {
	const transitions: CircuitBreakerTransition[] = [];
	const breaker = new CircuitBreaker({
		name: "RecoveryBreaker",
		failureThreshold: 1,
		resetTimeoutMs: 50, // Short timeout for testing
		halfOpenSuccessThreshold: 1,
		onStateChange: (t) => transitions.push(t),
	});

	// Trip to OPEN
	await breaker.execute(async () => {
		throw new Error("Trip error");
	}, () => "tripped");
	assert.equal(breaker.getState(), "OPEN");

	// Wait for reset timeout
	await new Promise((resolve) => setTimeout(resolve, 60));

	// State evaluates to HALF_OPEN
	assert.equal(breaker.getState(), "HALF_OPEN");
	assert.equal(breaker.isHalfOpen(), true);

	// Probe succeeds -> transitions to CLOSED
	let probeRan = false;
	const probeResult = await breaker.execute(async () => {
		probeRan = true;
		return "probe-success";
	});

	assert.equal(probeRan, true);
	assert.equal(probeResult, "probe-success");
	assert.equal(breaker.getState(), "CLOSED");
	assert.equal(breaker.isClosed(), true);

	const stateTransitions = transitions.map((t) => `${t.fromState}->${t.toState}`);
	assert.deepEqual(stateTransitions, ["CLOSED->OPEN", "OPEN->HALF_OPEN", "HALF_OPEN->CLOSED"]);
});

test("CircuitBreaker: transitions HALF_OPEN -> OPEN immediately if probe fails", async () => {
	const transitions: CircuitBreakerTransition[] = [];
	const breaker = new CircuitBreaker({
		name: "ProbeFailBreaker",
		failureThreshold: 1,
		resetTimeoutMs: 50,
		onStateChange: (t) => transitions.push(t),
	});

	// Trip to OPEN
	await breaker.execute(async () => {
		throw new Error("Trip");
	}, () => "fallback");

	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.equal(breaker.getState(), "HALF_OPEN");

	// Failed probe
	const fallback = await breaker.execute(async () => {
		throw new Error("Probe failed");
	}, () => "probe-fallback");

	assert.equal(fallback, "probe-fallback");
	assert.equal(breaker.getState(), "OPEN");
});

test("CircuitBreaker: manual trip and reset controls", () => {
	const breaker = new CircuitBreaker();
	assert.equal(breaker.getState(), "CLOSED");

	breaker.trip("Governance manual override");
	assert.equal(breaker.getState(), "OPEN");

	breaker.reset("Administrative reset");
	assert.equal(breaker.getState(), "CLOSED");
});

test("ZetarisFallbackCatalog: inventories all 8 Lightning databases", () => {
	const catalog = defaultZetarisFallbackCatalog;
	const dbNames = catalog.getDatabaseNames();

	const expectedDatabases = [
		"SEC_DATA",
		"OPENFDA_REST",
		"CLINICALTRIALS_REST",
		"GLEIF_REST",
		"POKEAPI_REST",
		"NY_TAXI",
		"COMPANY_DNS",
		"TPCDS_DB",
	];

	for (const expected of expectedDatabases) {
		assert.ok(dbNames.includes(expected), `Missing database: ${expected}`);
	}

	const res = catalog.resolveQuery("SHOW LIGHTNING DATABASES");
	assert.equal(res.columns[0], "database_name");
	assert.equal(res.rows.length, 8);
});

test("ZetarisFallbackCatalog: resolves schema and queries for SEC_DATA", () => {
	const catalog = new ZetarisFallbackCatalog();

	// 1. SHOW TABLES FROM SEC_DATA
	const tablesRes = catalog.resolveQuery("SHOW TABLES FROM SEC_DATA");
	assert.ok(tablesRes.rows.some((r) => r[1] === "apple_revenue_facts"));
	assert.ok(tablesRes.rows.some((r) => r[1] === "tesla_revenue_facts"));

	// 2. DESCRIBE SEC_DATA.apple_revenue_facts
	const descRes = catalog.resolveQuery("DESCRIBE SEC_DATA.apple_revenue_facts");
	assert.ok(descRes.rows.some((r) => r[0] === "revenue"));
	assert.ok(descRes.rows.some((r) => r[0] === "ticker"));

	// 3. SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 2
	const selectRes = catalog.resolveQuery("SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 2");
	assert.equal(selectRes.rows.length, 2);
	assert.equal(selectRes.rows[0][1], "AAPL"); // Ticker
});

test("ZetarisFallbackCatalog: resolves healthcare queries for OPENFDA_REST & CLINICALTRIALS_REST", () => {
	const catalog = new ZetarisFallbackCatalog();

	// OPENFDA_REST drug_labels_raw
	const fdaRes = catalog.resolveQuery("SELECT * FROM OPENFDA_REST.drug_labels_raw LIMIT 2");
	assert.equal(fdaRes.rows.length, 2);
	assert.ok(fdaRes.columns.includes("brand_name"));
	assert.ok(fdaRes.columns.includes("active_ingredient"));

	// OPENFDA_REST adverse_reactions_raw
	const advRes = catalog.resolveQuery("SELECT * FROM OPENFDA_REST.adverse_reactions_raw LIMIT 3");
	assert.equal(advRes.rows.length, 3);
	assert.ok(advRes.columns.includes("reaction_meddra_pt"));

	// CLINICALTRIALS_REST trials_raw
	const ctRes = catalog.resolveQuery("SELECT * FROM CLINICALTRIALS_REST.trials_raw LIMIT 2");
	assert.ok(ctRes.rows.some((r) => String(r[0]).startsWith("NCT")));
});

test("ZetarisFallbackCatalog: resolves PII tables and operations for NY_TAXI", () => {
	const catalog = new ZetarisFallbackCatalog();

	// Customer PII
	const custRes = catalog.resolveQuery("SELECT * FROM NY_TAXI.customers LIMIT 3");
	assert.equal(custRes.rows.length, 3);
	assert.ok(custRes.columns.includes("full_name"));
	assert.ok(custRes.columns.includes("email"));

	// Driver PII
	const drvRes = catalog.resolveQuery("SELECT * FROM NY_TAXI.drivers LIMIT 2");
	assert.ok(drvRes.columns.includes("driver_name"));
	assert.ok(drvRes.columns.includes("license_number"));

	// Trips aggregate count
	const countRes = catalog.resolveQuery("SELECT COUNT(*) FROM NY_TAXI.trips");
	assert.equal(countRes.rows[0][0], 1500000);
});

test("ResilientZetarisClient: offline daemon safety and transparent status flags", async () => {
	// Mock a failing ZetarisClient that simulates offline daemon / connection refused
	const offlineClient = new ZetarisClient({ restUrl: "http://127.0.0.1:9999" });
	const resilientClient = new ResilientZetarisClient({
		underlyingClient: offlineClient,
		circuitBreakerConfig: {
			failureThreshold: 2,
			resetTimeoutMs: 500,
		},
	});

	// Query 1: live daemon fails -> caught and returns synthetic fallback
	const result1 = await resilientClient.query("SHOW LIGHTNING DATABASES");
	assert.equal(result1.isSynthetic, true);
	assert.equal(result1.evidenceSource, "synthetic_fallback");
	assert.ok(result1.circuitBreakerState === "CLOSED" || result1.circuitBreakerState === "OPEN");
	assert.equal(result1.rows.length, 8);

	// Query 2: second failure trips circuit to OPEN
	const result2 = await resilientClient.query("SELECT * FROM SEC_DATA.apple_revenue_facts LIMIT 3");
	assert.equal(result2.isSynthetic, true);
	assert.equal(result2.evidenceSource, "synthetic_fallback");
	assert.equal(result2.circuitBreakerState, "OPEN");
	assert.equal(result2.rows.length, 3);
	assert.ok(resilientClient.getCircuitBreaker().isOpen());

	// Query 3: circuit is OPEN -> fast-failover executes in 0-5ms without network fetch
	const t0 = Date.now();
	const result3 = await resilientClient.query("SELECT * FROM NY_TAXI.customers LIMIT 2");
	const duration = Date.now() - t0;
	assert.equal(result3.isSynthetic, true);
	assert.equal(result3.circuitBreakerState, "OPEN");
	assert.equal(result3.evidenceSource, "synthetic_fallback");
	assert.equal(result3.rows.length, 2);
	assert.ok(duration < 50, `Fast-failover should be instantaneous; took ${duration}ms`);
});

test("ResilientZetarisClient: handles live query when online", async () => {
	// Mock client with custom mock query
	const mockClient = {
		query: async () => ({
			columns: ["col1", "col2"],
			rows: [["val1", "val2"]],
			total: 1,
			timeUsed: 5,
		}),
	} as unknown as ZetarisClient;

	const resilient = new ResilientZetarisClient({
		underlyingClient: mockClient,
	});

	const res = await resilient.query("SELECT 1");
	assert.equal(res.isSynthetic, false);
	assert.equal(res.evidenceSource, "live_zetaris");
	assert.equal(res.circuitBreakerState, "CLOSED");
	assert.deepEqual(res.rows, [["val1", "val2"]]);
});
