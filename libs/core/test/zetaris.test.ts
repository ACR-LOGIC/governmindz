
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
	assertReadOnlySql,
	splitSqlStatements,
	ZetarisClient,
} from "../src/integrations/zetarisClient.js";

async function withServer(
	handler: (req: any, res: any) => void,
	run: (baseUrl: string) => Promise<void>,
): Promise<void> {
	const server = createServer(handler);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	try {
		await run(`http://127.0.0.1:${address.port}/api/v1.0`);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

test("splits semicolons only outside quotes and comments", () => {
	assert.deepEqual(splitSqlStatements("SELECT ';' AS semi;"), [
		"SELECT ';' AS semi",
	]);
	assert.deepEqual(splitSqlStatements("-- comment;\nSELECT 1;;"), ["SELECT 1"]);
	assert.deepEqual(splitSqlStatements("/* ; */ SELECT 1"), ["SELECT 1"]);
});

test("accepts read-only statements", () => {
	for (const sql of [
		"SELECT 1",
		"SELECT 1;",
		"SHOW LIGHTNING DATABASES",
		"DESCRIBE ny_taxi.trips",
		"DESC ny_taxi.trips",
		"EXPLAIN SELECT 1",
		"WITH x AS (SELECT 1) SELECT * FROM x",
		"SELECT * FROM ny_taxi.trips LIMIT 5",
	]) {
		assert.doesNotThrow(() => assertReadOnlySql(sql), sql);
	}
});

test("rejects writes, DDL, INTO, FOR UPDATE, and multiple statements", () => {
	for (const sql of [
		"DROP TABLE ny_taxi.trips",
		"INSERT INTO t VALUES (1)",
		"UPDATE t SET x = 1",
		"DELETE FROM t",
		"CREATE TABLE t (id INT)",
		"ALTER TABLE t ADD c INT",
		"TRUNCATE TABLE t",
		"GRANT SELECT ON t TO u",
		"WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x",
		"SELECT * INTO t FROM x",
		"SELECT * FROM t FOR UPDATE",
		"EXPLAIN ANALYZE DELETE FROM t",
		"SELECT 1; DROP TABLE t",
	]) {
		assert.throws(() => assertReadOnlySql(sql), /read-only|Expected exactly one|INTO|FOR UPDATE/i, sql);
	}
});

test("query sends auth, org, request id, and maps headers/data", async () => {
	let captured: {
		url?: string;
		headers?: Record<string, unknown>;
		body?: any;
	} = {};

	await withServer(
		(req, res) => {
			captured.url = req.url;
			captured.headers = req.headers;
			let body = "";
			req.on("data", (chunk: any) => {
				body += String(chunk);
			});
			req.on("end", () => {
				captured.body = JSON.parse(body);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						headers: ["name", "description", "count"],
						data: [["NY_TAXI", "NY Taxi sample data", 6]],
						total: 1,
						timeUsed: 5,
					}),
				);
			});
		},
		async (baseUrl) => {
			const client = new ZetarisClient({
				restUrl: baseUrl,
				apiKey: "test-key",
				orgId: "1",
			});
			const result = await client.query("SHOW LIGHTNING DATABASES", {
				limit: 20,
			});
			assert.deepEqual(result.columns, ["name", "description", "count"]);
			assert.deepEqual(result.rows, [["NY_TAXI", "NY Taxi sample data", 6]]);
			assert.equal(result.total, 1);
			assert.equal(result.timeUsed, 5);
		},
	);

	assert.equal(captured.url, "/api/v1.0/sql-editor/sqls/run");
	assert.equal(captured.headers?.authorization, "Bearer test-key");
	assert.equal(captured.headers?.["x-org-id"], "1");
	assert.match(String(captured.headers?.["x-request-id"]), /^[0-9a-f-]{36}$/);
	assert.match(String(captured.body.queryId), /^[0-9a-f-]{36}$/);
	assert.equal(captured.body.source, "SqlEditor");
	assert.equal(captured.body.limit, 20);
	assert.equal(captured.body.sql, "SHOW LIGHTNING DATABASES");
});

test("rejects unsupported statements before any network call", async () => {
	const client = new ZetarisClient({
		restUrl: "http://127.0.0.1:1/api/v1.0",
		apiKey: "test-key",
	});
	await assert.rejects(
		() => client.query("DELETE FROM ny_taxi.trips"),
		/read-only/,
	);
});

test("surfaces HTTP errors without leaking the token", async () => {
	await withServer(
		(_req, res) => {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					message: "bad key super-secret-token",
				}),
			);
		},
		async (baseUrl) => {
			const client = new ZetarisClient({
				restUrl: baseUrl,
				apiKey: "super-secret-token",
			});
			await assert.rejects(
				() => client.query("SELECT 1"),
				(error: any) => {
					assert.equal(error.status, 401);
					assert.equal(error.message.includes("super-secret-token"), false);
					assert.match(error.message, /<redacted>/);
					return true;
				},
			);
		},
	);
});
