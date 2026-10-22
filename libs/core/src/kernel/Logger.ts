// Copyright (c) 2026 ACR Logic.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
	ts: string;
	level: LogLevel;
	event: string;
	[key: string]: unknown;
};

/**
 * Pluggable error reporter — implement this interface to forward errors to
 * an external tracker such as Sentry, Datadog, or a custom endpoint.
 *
 * Example Sentry adapter:
 *   Logger.configure({
 *     errorReporter: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
 *   });
 */
export type ErrorReporter = (
	error: unknown,
	context?: Record<string, unknown>,
) => void;

/**
 * Centralized structured logger for the GOVERNMINDZ kernel.
 *
 * Outputs newline-delimited JSON (NDJSON) to the console so that log
 * aggregators (e.g. Loki, CloudWatch, Datadog) can ingest them without
 * additional parsing.  An optional {@link ErrorReporter} hook allows
 * forwarding `error`-level entries to any external error-tracking service.
 */
export class Logger {
	private static _errorReporter: ErrorReporter | null = null;
	private static _minLevel: LogLevel = "debug";

	private static _levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	static configure({
		errorReporter,
		minLevel,
	}: {
		errorReporter?: ErrorReporter;
		minLevel?: LogLevel;
	} = {}) {
		if (errorReporter !== undefined) {
			Logger._errorReporter = errorReporter;
		}
		if (minLevel !== undefined) {
			Logger._minLevel = minLevel;
		}
	}

	private static _write(
		level: LogLevel,
		event: string,
		payload: Record<string, unknown> = {},
	): void {
		if (Logger._levels[level] < Logger._levels[Logger._minLevel]) return;

		const entry: LogEntry = {
			ts: new Date().toISOString(),
			level,
			event,
			...payload,
		};

		const line = JSON.stringify(entry);

		if (level === "error") {
			console.error(line);
		} else if (level === "warn") {
			console.warn(line);
		} else {
			console.log(line);
		}
	}

	static debug(event: string, payload?: Record<string, unknown>): void {
		Logger._write("debug", event, payload);
	}

	static info(event: string, payload?: Record<string, unknown>): void {
		Logger._write("info", event, payload);
	}

	static warn(event: string, payload?: Record<string, unknown>): void {
		Logger._write("warn", event, payload);
	}

	/**
	 * Logs an error-level entry and optionally forwards it to the configured
	 * {@link ErrorReporter} (e.g. Sentry).
	 */
	static error(
		event: string,
		error?: unknown,
		payload?: Record<string, unknown>,
	): void {
		const errorInfo: Record<string, unknown> =
			error instanceof Error
				? { message: error.message, stack: error.stack }
				: error !== undefined
					? { message: String(error) }
					: {};

		Logger._write("error", event, { ...errorInfo, ...payload });

		if (Logger._errorReporter && error !== undefined) {
			try {
				Logger._errorReporter(error, { event, ...payload });
			} catch {
				// Never let the reporter itself crash the process.
			}
		}
	}
}
