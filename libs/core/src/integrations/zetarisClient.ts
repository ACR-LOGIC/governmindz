
import { randomUUID } from "node:crypto";

const DEFAULT_REST_URL = "http://localhost:8888/api/v1.0";
const DEFAULT_ORG_ID = "1";
const DEFAULT_TIMEOUT_MS = 600_000;
const MAX_SQL_LENGTH = 20_000;

const READ_ONLY_STARTS = new Set([
	"SELECT",
	"WITH",
	"SHOW",
	"DESCRIBE",
	"DESC",
	"EXPLAIN",
]);

const DISALLOWED_KEYWORDS =
	/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CALL|EXEC|EXECUTE|SET|USE|LOAD|COPY|VACUUM)\b/i;

export class ZetarisError extends Error {
	readonly code: string;
	readonly status?: number;

	constructor(message: string, code = "ZETARIS_ERROR", status?: number) {
		super(message);
		this.name = "ZetarisError";
		this.code = code;
		this.status = status;
	}
}

export interface ZetarisConfig {
	restUrl?: string;
	apiKey?: string;
	orgId?: string;
	timeoutMs?: number;
}

export interface ZetarisQueryResult {
	columns: string[];
	rows: unknown[][];
	total?: number;
	timeUsed?: number;
}

interface ZetarisRestResponse {
	headers?: unknown;
	data?: unknown;
	total?: unknown;
	timeUsed?: unknown;
	[key: string]: unknown;
}

function env(name: string): string {
	return (process.env[name] ?? "").trim();
}

function normalizeBaseUrl(value: string): string {
	let trimmed = value.trim() || DEFAULT_REST_URL;
	while (trimmed.endsWith("/")) { trimmed = trimmed.slice(0, -1); } return trimmed;
}

/**
 * Split SQL on semicolons outside quotes and comments. This mirrors the
 * onboarding runner's quote-aware splitter so a semicolon inside a string
 * literal is not treated as a statement boundary.
 */
export function splitSqlStatements(text: string): string[] {
	const statements: string[] = [];
	let buffer: string[] = [];
	let quote: string | null = null;
	let i = 0;

	const push = () => {
		const statement = buffer.join("").trim();
		if (statement) statements.push(statement);
		buffer = [];
	};

	while (i < text.length) {
		const char = text[i];

		if (quote) {
			buffer.push(char);
			if (char === quote) {
				if (text[i + 1] === quote) {
					buffer.push(text[i + 1]);
					i += 1;
				} else {
					quote = null;
				}
			}
			i += 1;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			buffer.push(char);
			i += 1;
			continue;
		}

		if (text.startsWith("--", i)) {
			while (i < text.length && text[i] !== "\n") i += 1;
			continue;
		}

		if (text.startsWith("/*", i)) {
			const end = text.indexOf("*/", i + 2);
			i = end === -1 ? text.length : end + 2;
			continue;
		}

		if (char === ";") {
			push();
			i += 1;
			continue;
		}

		buffer.push(char);
		i += 1;
	}

	push();
	return statements;
}

function stripSqlLiteralsAndComments(text: string): string {
	let output = "";
	let quote: string | null = null;
	let i = 0;

	while (i < text.length) {
		const char = text[i];

		if (quote) {
			if (char === quote) {
				if (text[i + 1] === quote) {
					i += 2;
					continue;
				}
				quote = null;
			}
			output += " ";
			i += 1;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			quote = char;
			output += " ";
			i += 1;
			continue;
		}

		if (text.startsWith("--", i)) {
			while (i < text.length && text[i] !== "\n") i += 1;
			output += " ";
			continue;
		}

		if (text.startsWith("/*", i)) {
			const end = text.indexOf("*/", i + 2);
			i = end === -1 ? text.length : end + 2;
			output += " ";
			continue;
		}

		output += char;
		i += 1;
	}

	return output;
}

/**
 * Defense-in-depth read-only guard. The Zetaris credential should also be
 * scoped server-side to a read-only role; this check is not a security
 * boundary on its own.
 */
export function assertReadOnlySql(sql: string): string {
	const trimmed = sql.trim();
	if (!trimmed) {
		throw new ZetarisError("SQL query is empty.", "ZETARIS_EMPTY_SQL");
	}
	if (trimmed.length > MAX_SQL_LENGTH) {
		throw new ZetarisError(
			`SQL query exceeds the ${MAX_SQL_LENGTH} character limit.`,
			"ZETARIS_SQL_TOO_LONG",
		);
	}

	const statements = splitSqlStatements(trimmed);
	if (statements.length !== 1) {
		throw new ZetarisError(
			`Expected exactly one statement, received ${statements.length}.`,
			"ZETARIS_MULTI_STATEMENT",
		);
	}

	const statement = statements[0];
	const sanitized = stripSqlLiteralsAndComments(statement);
	const firstToken = sanitized.match(/[A-Za-z_]+/)?.[0]?.toUpperCase() ?? "";

	if (!READ_ONLY_STARTS.has(firstToken)) {
		throw new ZetarisError(
			`Only read-only statements are allowed; received '${firstToken || "unknown"}'.`,
			"ZETARIS_READ_ONLY_REQUIRED",
		);
	}

	if (/\bINTO\b/i.test(sanitized)) {
		throw new ZetarisError(
			"SELECT ... INTO is not allowed.",
			"ZETARIS_READ_ONLY_REQUIRED",
		);
	}

	if (/\bFOR\s+UPDATE\b/i.test(sanitized)) {
		throw new ZetarisError(
			"SELECT ... FOR UPDATE is not allowed.",
			"ZETARIS_READ_ONLY_REQUIRED",
		);
	}

	if (firstToken === "WITH" || firstToken === "EXPLAIN") {
		const match = sanitized.match(DISALLOWED_KEYWORDS);
		if (match) {
			throw new ZetarisError(
				`Statement contains a non-read-only keyword: '${match[1].toUpperCase()}'.`,
				"ZETARIS_READ_ONLY_REQUIRED",
			);
		}
	}

	return statement;
}

function parseColumns(headers: unknown, rowWidth: number): string[] {
	if (Array.isArray(headers)) {
		const columns = headers.map((header, index) => {
			if (typeof header === "string") return header;
			if (header && typeof header === "object") {
				const record = header as Record<string, unknown>;
				const named = record.name ?? record.label ?? record.column;
				if (typeof named === "string") return named;
			}
			return `column_${index + 1}`;
		});
		if (columns.length > 0) return columns;
	}
	return Array.from({ length: rowWidth }, (_, index) => `column_${index + 1}`);
}

function normalizeRows(data: unknown): unknown[][] {
	if (!Array.isArray(data)) return [];
	return data.map((row) => (Array.isArray(row) ? row : [row]));
}

export class ZetarisClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly orgId: string;
	private readonly timeoutMs: number;

	constructor(config: ZetarisConfig = {}) {
		this.baseUrl = normalizeBaseUrl(config.restUrl ?? env("ZETARIS_REST_URL"));
		this.apiKey = (
			config.apiKey?.trim() ||
			env("ZETARIS_API_KEY") ||
			env("ZETARIS_API_AUTH") ||
			""
		);
		this.orgId =
			(config.orgId?.trim() || env("ZETARIS_ORG_ID") || DEFAULT_ORG_ID).trim();
		this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	missingConfig(): string[] {
		const missing: string[] = [];
		if (!this.apiKey) missing.push("ZETARIS_API_KEY (or ZETARIS_API_AUTH)");
		if (!this.baseUrl) missing.push("ZETARIS_REST_URL");
		if (!this.orgId) missing.push("ZETARIS_ORG_ID");
		return missing;
	}

	validateConfig(): void {
		const missing = this.missingConfig();
		if (missing.length > 0) {
			throw new ZetarisError(
				`Missing Zetaris configuration: ${missing.join(", ")}`,
				"ZETARIS_CONFIG_MISSING",
			);
		}
	}

	async query(sql: string, options: { limit?: number; timeoutMs?: number } = {}): Promise<ZetarisQueryResult> {
		this.validateConfig();
		const statement = assertReadOnlySql(sql);
		const timeoutMs = options.timeoutMs ?? this.timeoutMs;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/sql-editor/sqls/run`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"X-Org-ID": this.orgId,
					"X-Request-ID": randomUUID(),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					queryId: randomUUID(),
					sql: statement,
					source: "SqlEditor",
					limit: options.limit ?? 100,
				}),
				signal: controller.signal,
			});
		} catch (error) {
			if ((error as { name?: string })?.name === "AbortError") {
				throw new ZetarisError(
					`Zetaris request timed out after ${timeoutMs}ms.`,
					"ZETARIS_TIMEOUT",
				);
			}
			throw new ZetarisError(
				`Cannot reach Zetaris at ${this.baseUrl}: ${
					error instanceof Error ? error.message : String(error)
				}`,
				"ZETARIS_UNREACHABLE",
			);
		} finally {
			clearTimeout(timeout);
		}

		const bodyText = await response.text();
		let payload: ZetarisRestResponse | null = null;
		try {
			payload = bodyText ? (JSON.parse(bodyText) as ZetarisRestResponse) : null;
		} catch {
			payload = null;
		}

		if (!response.ok) {
			const detail = this.redact(bodyText.replace(/\s+/g, " ").slice(0, 400));
			throw new ZetarisError(
				`Zetaris HTTP ${response.status}: ${detail || response.statusText}`,
				"ZETARIS_HTTP_ERROR",
				response.status,
			);
		}

		const rows = normalizeRows(payload?.data);
		const rowWidth = rows.reduce((width, row) => Math.max(width, row.length), 0);
		return {
			columns: parseColumns(payload?.headers, rowWidth),
			rows,
			total: typeof payload?.total === "number" ? payload.total : undefined,
			timeUsed:
				typeof payload?.timeUsed === "number" ? payload.timeUsed : undefined,
		};
	}

	private redact(value: string): string {
		if (!this.apiKey) return value;
		return value.split(this.apiKey).join("<redacted>");
	}

	async listDatabases(): Promise<ZetarisQueryResult> {
		return this.query("SHOW LIGHTNING DATABASES");
	}
}

export function createZetarisClientFromEnv(): ZetarisClient {
	return new ZetarisClient();
}
