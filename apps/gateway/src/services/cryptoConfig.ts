import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const MASTER_KEY_PATH = path.join(DATA_DIR, ".master.key");
const ENC_CREDS_PATH = path.join(DATA_DIR, "credentials.enc");
const ENV_LOCAL_PATH = path.resolve(process.cwd(), ".env.local");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure or load 32-byte master key
function getOrCreateMasterKey(): Buffer {
	if (fs.existsSync(MASTER_KEY_PATH)) {
		try {
			const keyHex = fs.readFileSync(MASTER_KEY_PATH, "utf8").trim();
			if (keyHex.length === 64) {
				return Buffer.from(keyHex, "hex");
			}
		} catch {
			// fallback to regenerate
		}
	}
	const newKey = crypto.randomBytes(32);
	try {
		fs.writeFileSync(MASTER_KEY_PATH, newKey.toString("hex"), { mode: 0o600 });
	} catch {
		fs.writeFileSync(MASTER_KEY_PATH, newKey.toString("hex"));
	}
	return newKey;
}

const ALGORITHM = "aes-256-gcm";

export function encryptSecret(plaintext: string): string {
	if (!plaintext) return "";
	const key = getOrCreateMasterKey();
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag().toString("hex");
	return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptSecret(encryptedPayload: string): string {
	if (!encryptedPayload) return "";
	const parts = encryptedPayload.split(":");
	if (parts.length !== 3) return "";
	const [ivHex, authTagHex, cipherHex] = parts;
	const key = getOrCreateMasterKey();
	const iv = Buffer.from(ivHex, "hex");
	const authTag = Buffer.from(authTagHex, "hex");
	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(cipherHex, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
}

/**
 * Automatically load environment variables from .env.local and decrypted credentials.enc
 * if they are not already set in process.env.
 */
export function loadLocalEnvIfPresent(): void {
	if (fs.existsSync(ENV_LOCAL_PATH)) {
		try {
			const envLines = fs.readFileSync(ENV_LOCAL_PATH, "utf8").split(/\r?\n/);
			for (const line of envLines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const eqIndex = trimmed.indexOf("=");
				if (eqIndex > 0) {
					const k = trimmed.slice(0, eqIndex).trim();
					const v = trimmed.slice(eqIndex + 1).trim();
					if (!process.env[k]) {
						process.env[k] = v;
					}
				}
			}
		} catch {
			// ignore
		}
	}

	if (fs.existsSync(ENC_CREDS_PATH)) {
		try {
			const encContent = fs.readFileSync(ENC_CREDS_PATH, "utf8").trim();
			if (encContent) {
				const decrypted = decryptSecret(encContent);
				if (decrypted) {
					const parsed = JSON.parse(decrypted);
					if (parsed.meterlessHost && !process.env.METERLESS_BASE_URL) process.env.METERLESS_BASE_URL = parsed.meterlessHost;
					if (parsed.meterlessApiKey && !process.env.METERLESS_API_KEY) process.env.METERLESS_API_KEY = parsed.meterlessApiKey;
					if (parsed.meterlessModel && !process.env.METERLESS_MODEL) process.env.METERLESS_MODEL = parsed.meterlessModel;
					if (parsed.zetarisHost && !process.env.ZETARIS_HOST) process.env.ZETARIS_HOST = parsed.zetarisHost;
					if (parsed.zetarisPort && !process.env.ZETARIS_PORT) process.env.ZETARIS_PORT = parsed.zetarisPort;
					if (parsed.zetarisUser && !process.env.ZETARIS_USER) process.env.ZETARIS_USER = parsed.zetarisUser;
					if (parsed.zetarisPassword && !process.env.ZETARIS_PASSWORD) process.env.ZETARIS_PASSWORD = parsed.zetarisPassword;
					if (parsed.zetarisApiKey && !process.env.ZETARIS_API_KEY) process.env.ZETARIS_API_KEY = parsed.zetarisApiKey;
					if (parsed.zetarisApiAuth && !process.env.ZETARIS_API_AUTH) process.env.ZETARIS_API_AUTH = parsed.zetarisApiAuth;
					if (parsed.zetarisDatabase && !process.env.ZETARIS_DATABASE) process.env.ZETARIS_DATABASE = parsed.zetarisDatabase;
					if (parsed.auditSecret && !process.env.AUDIT_TRAIL_SECRET) process.env.AUDIT_TRAIL_SECRET = parsed.auditSecret;
				}
			}
		} catch {
			// ignore
		}
	}
}

// Auto-run once on module import
loadLocalEnvIfPresent();

export interface ConfigStatus {
	meterlessConfigured: boolean;
	meterlessHost: string;
	meterlessModel: string;
	hasMeterlessKey: boolean;
	zetarisConfigured: boolean;
	zetarisHost: string;
	zetarisPort: string;
	zetarisUser: string;
	zetarisDatabase: string;
	hasZetarisPassword: boolean;
	hasZetarisApiKey: boolean;
	auditSecretConfigured: boolean;
}

export function maskString(str?: string, visibleChars = 3): string {
	if (!str) return "";
	if (str.length <= visibleChars * 2) {
		return str.slice(0, 1) + "***" + str.slice(-1);
	}
	return str.slice(0, visibleChars) + "***" + str.slice(-visibleChars);
}

export function getConfigStatus(): ConfigStatus {
	loadLocalEnvIfPresent();

	const meterlessHost = process.env.METERLESS_BASE_URL || process.env.METERLESS_ENDPOINT || "";
	const meterlessKey = process.env.METERLESS_API_KEY || process.env.METERLESS_RUNTIME_TOKEN || "";
	const meterlessModel = process.env.METERLESS_MODEL || process.env.NEMOTRON_MODEL || "nemotron-3.5-lightning-30b-a3b";

	const rawZetaris = process.env.ZETARIS_HOST || process.env.ZETARIS_REST_URL || process.env.ZETARIS_JDBC_URL || "";
	let zetarisHost = rawZetaris;
	let zetarisPort = process.env.ZETARIS_PORT || "443";
	if (rawZetaris.startsWith("http://") || rawZetaris.startsWith("https://")) {
		try {
			const u = new URL(rawZetaris);
			zetarisHost = u.hostname;
			zetarisPort = u.port || (u.protocol === "https:" ? "443" : "80");
		} catch {
			// keep raw
		}
	} else if (rawZetaris.startsWith("jdbc:zetaris:lightning@")) {
		const parts = rawZetaris.replace("jdbc:zetaris:lightning@", "").split(":");
		zetarisHost = parts[0] || "localhost";
		zetarisPort = parts[1] || "10000";
	}

	const zetarisUser = process.env.ZETARIS_USER || process.env.ZETARIS_USERNAME || "";
	const zetarisPass = process.env.ZETARIS_PASSWORD || "";
	const zetarisApiKey = process.env.ZETARIS_API_KEY || process.env.ZETARIS_API_AUTH || "";
	const zetarisDb = process.env.ZETARIS_DATABASE || "LIGHTNING_DB";

	const auditSecret = process.env.AUDIT_TRAIL_SECRET || "";

	const zetarisConfigured = Boolean(
		(process.env.ZETARIS_HOST?.trim() || process.env.ZETARIS_REST_URL?.trim() || process.env.ZETARIS_JDBC_URL?.trim()) &&
		zetarisApiKey.trim()
	);

	const meterlessConfigured = Boolean(
		meterlessHost.trim() &&
		(meterlessKey.trim() || process.env.METERLESS_APP_ID?.trim())
	);

	return {
		meterlessConfigured,
		meterlessHost: meterlessHost ? maskString(meterlessHost, 7) : "",
		meterlessModel,
		hasMeterlessKey: Boolean(meterlessKey.trim()),
		zetarisConfigured,
		zetarisHost: zetarisHost ? maskString(zetarisHost, 4) : "",
		zetarisPort,
		zetarisUser: zetarisUser ? maskString(zetarisUser, 2) : "",
		zetarisDatabase: zetarisDb,
		hasZetarisPassword: Boolean(zetarisPass.trim()),
		hasZetarisApiKey: Boolean(zetarisApiKey.trim()),
		auditSecretConfigured: Boolean(auditSecret.trim()),
	};
}

export interface SaveConfigPayload {
	meterlessHost?: string;
	meterlessApiKey?: string;
	meterlessModel?: string;
	zetarisHost?: string;
	zetarisPort?: string;
	zetarisUser?: string;
	zetarisPassword?: string;
	zetarisApiKey?: string;
	zetarisDatabase?: string;
	auditSecret?: string;
}

export function saveSecureConfig(payload: SaveConfigPayload): void {
	// 1. Update current process.env in-memory
	if (payload.meterlessHost !== undefined) {
		process.env.METERLESS_BASE_URL = payload.meterlessHost.trim();
	}
	if (payload.meterlessApiKey !== undefined) {
		process.env.METERLESS_API_KEY = payload.meterlessApiKey.trim();
	}
	if (payload.meterlessModel !== undefined) {
		process.env.METERLESS_MODEL = payload.meterlessModel.trim();
	}
	if (payload.zetarisHost !== undefined) {
		const zh = payload.zetarisHost.trim();
		process.env.ZETARIS_HOST = zh;
		if (zh.startsWith("http://") || zh.startsWith("https://")) {
			process.env.ZETARIS_REST_URL = zh;
		} else if (zh) {
			const port = payload.zetarisPort?.trim() || process.env.ZETARIS_PORT || "8888";
			const protocol = port === "443" ? "https" : "http";
			process.env.ZETARIS_REST_URL = `${protocol}://${zh}:${port}/api/v1.0`;
		}
	}
	if (payload.zetarisPort !== undefined) {
		process.env.ZETARIS_PORT = payload.zetarisPort.trim();
	}
	if (payload.zetarisUser !== undefined) {
		process.env.ZETARIS_USER = payload.zetarisUser.trim();
		process.env.ZETARIS_USERNAME = payload.zetarisUser.trim();
	}
	if (payload.zetarisPassword !== undefined) {
		process.env.ZETARIS_PASSWORD = payload.zetarisPassword.trim();
	}
	if (payload.zetarisApiKey !== undefined) {
		process.env.ZETARIS_API_KEY = payload.zetarisApiKey.trim();
	}
	if (payload.zetarisDatabase !== undefined) {
		process.env.ZETARIS_DATABASE = payload.zetarisDatabase.trim();
	}
	if (payload.auditSecret !== undefined) {
		process.env.AUDIT_TRAIL_SECRET = payload.auditSecret.trim();
	}

	// 2. Read existing .env.local if any
	let envLines: string[] = [];
	if (fs.existsSync(ENV_LOCAL_PATH)) {
		try {
			envLines = fs.readFileSync(ENV_LOCAL_PATH, "utf8").split(/\r?\n/);
		} catch {
			envLines = [];
		}
	}

	const envMap = new Map<string, string>();
	for (const line of envLines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIndex = trimmed.indexOf("=");
		if (eqIndex > 0) {
			const k = trimmed.slice(0, eqIndex).trim();
			const v = trimmed.slice(eqIndex + 1).trim();
			envMap.set(k, v);
		}
	}

	// Update map with active values
	if (process.env.METERLESS_BASE_URL) envMap.set("METERLESS_BASE_URL", process.env.METERLESS_BASE_URL);
	if (process.env.METERLESS_API_KEY) envMap.set("METERLESS_API_KEY", process.env.METERLESS_API_KEY);
	if (process.env.METERLESS_MODEL) envMap.set("METERLESS_MODEL", process.env.METERLESS_MODEL);
	if (process.env.ZETARIS_HOST) envMap.set("ZETARIS_HOST", process.env.ZETARIS_HOST);
	if (process.env.ZETARIS_REST_URL) envMap.set("ZETARIS_REST_URL", process.env.ZETARIS_REST_URL);
	if (process.env.ZETARIS_PORT) envMap.set("ZETARIS_PORT", process.env.ZETARIS_PORT);
	if (process.env.ZETARIS_USER) envMap.set("ZETARIS_USER", process.env.ZETARIS_USER);
	if (process.env.ZETARIS_USERNAME) envMap.set("ZETARIS_USERNAME", process.env.ZETARIS_USERNAME);
	if (process.env.ZETARIS_PASSWORD) envMap.set("ZETARIS_PASSWORD", process.env.ZETARIS_PASSWORD);
	if (process.env.ZETARIS_API_KEY) envMap.set("ZETARIS_API_KEY", process.env.ZETARIS_API_KEY);
	if (process.env.ZETARIS_API_AUTH) envMap.set("ZETARIS_API_AUTH", process.env.ZETARIS_API_AUTH);
	if (process.env.ZETARIS_DATABASE) envMap.set("ZETARIS_DATABASE", process.env.ZETARIS_DATABASE);
	if (process.env.AUDIT_TRAIL_SECRET) envMap.set("AUDIT_TRAIL_SECRET", process.env.AUDIT_TRAIL_SECRET);

	// Generate clean output
	const newContent = Array.from(envMap.entries())
		.map(([k, v]) => `${k}=${v}`)
		.join("\n") + "\n";

	// Write atomically to .env.local
	const tmpPath = `${ENV_LOCAL_PATH}.${Date.now()}.tmp`;
	fs.writeFileSync(tmpPath, newContent, "utf8");
	fs.renameSync(tmpPath, ENV_LOCAL_PATH);

	// 3. Encrypt all sensitive values to credentials.enc at rest
	const sensitiveDump = JSON.stringify({
		meterlessHost: process.env.METERLESS_BASE_URL || "",
		meterlessApiKey: process.env.METERLESS_API_KEY || "",
		meterlessModel: process.env.METERLESS_MODEL || "",
		zetarisHost: process.env.ZETARIS_HOST || "",
		zetarisPort: process.env.ZETARIS_PORT || "",
		zetarisUser: process.env.ZETARIS_USER || "",
		zetarisPassword: process.env.ZETARIS_PASSWORD || "",
		zetarisApiKey: process.env.ZETARIS_API_KEY || "",
		zetarisApiAuth: process.env.ZETARIS_API_AUTH || "",
		zetarisDatabase: process.env.ZETARIS_DATABASE || "",
		auditSecret: process.env.AUDIT_TRAIL_SECRET || "",
		updatedAt: new Date().toISOString(),
	});

	const encrypted = encryptSecret(sensitiveDump);
	const encTmp = `${ENC_CREDS_PATH}.${Date.now()}.tmp`;
	fs.writeFileSync(encTmp, encrypted, "utf8");
	fs.renameSync(encTmp, ENC_CREDS_PATH);
}
