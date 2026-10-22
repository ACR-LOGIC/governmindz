// Copyright (c) 2026 ACR Logic.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const METERLESS_TOKEN_KEY = "meterless_runtime_token";
export const METERLESS_BASE_URL_KEY = "meterless_runtime_base_url";

export interface MeterlessKeyValueStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

type MeterlessStoreRecord = Record<string, string>;

function env(name: string): string {
	return (process.env[name] ?? "").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
	return values.find((value) => Boolean(value?.trim()))?.trim() ?? "";
}

function browserStorage(): MeterlessKeyValueStore | undefined {
	try {
		return typeof localStorage !== "undefined" ? localStorage : undefined;
	} catch {
		return undefined;
	}
}

export function resolveMeterlessStateDir(explicit?: string): string {
	const configured = firstNonEmpty(explicit, env("METERLESS_STATE_DIR"));
	if (configured) return resolve(configured);

	const home = firstNonEmpty(env("USERPROFILE"), env("HOME"), homedir());
	switch (process.platform) {
		case "win32":
			return join(
				firstNonEmpty(env("LOCALAPPDATA"), join(home, "AppData", "Local")),
				"Meterless",
			);
		case "darwin":
			return join(home, "Library", "Application Support", "Meterless");
		default:
			return join(
				firstNonEmpty(env("XDG_STATE_HOME"), join(home, ".local", "state")),
				"meterless",
			);
	}
}

export class MeterlessTokenStore {
	readonly stateDir: string;
	readonly storagePath: string;
	private readonly storage: MeterlessKeyValueStore | undefined;

	constructor(options: {
		stateDir?: string;
		storage?: MeterlessKeyValueStore;
	} = {}) {
		this.stateDir = resolveMeterlessStateDir(options.stateDir);
		this.storagePath = join(this.stateDir, "meterless-provider.json");
		this.storage = options.storage ?? browserStorage();
	}

	getStoredToken(): string {
		return firstNonEmpty(
			this.storage?.getItem(METERLESS_TOKEN_KEY),
			this.readRecord()[METERLESS_TOKEN_KEY],
		);
	}

	getToken(): string {
		return firstNonEmpty(this.getStoredToken(), this.readRuntimeToken());
	}

	setToken(token: string): void {
		const trimmed = token.trim();
		if (!trimmed) return;
		this.writeKey(METERLESS_TOKEN_KEY, trimmed);
	}

	getBaseUrl(): string {
		return firstNonEmpty(
			this.storage?.getItem(METERLESS_BASE_URL_KEY),
			this.readRecord()[METERLESS_BASE_URL_KEY],
		);
	}

	setBaseUrl(baseUrl: string): void {
		const trimmed = baseUrl.trim();
		if (!trimmed) return;
		this.writeKey(METERLESS_BASE_URL_KEY, trimmed);
	}

	readRuntimeToken(): string {
		const path = join(this.stateDir, "proxy-token");
		try {
			if (!existsSync(path)) return "";
			return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
		} catch {
			return "";
		}
	}

	private readRecord(): MeterlessStoreRecord {
		try {
			if (!existsSync(this.storagePath)) return {};
			const parsed = JSON.parse(readFileSync(this.storagePath, "utf8"));
			if (!parsed || typeof parsed !== "object") return {};
			return Object.fromEntries(
				Object.entries(parsed as Record<string, unknown>).filter(
					(entry): entry is [string, string] => typeof entry[1] === "string",
				),
			);
		} catch {
			return {};
		}
	}

	private writeKey(key: string, value: string): void {
		if (this.storage) {
			this.storage.setItem(key, value);
			return;
		}
		const next = { ...this.readRecord(), [key]: value };
		mkdirSync(dirname(this.storagePath), { recursive: true });
		writeFileSync(
			this.storagePath,
			JSON.stringify(next, null, 2),
			{ encoding: "utf8", mode: 0o600 },
		);
	}
}
