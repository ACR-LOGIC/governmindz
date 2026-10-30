// Ambient declarations for Node built-ins and globals used by the baseline
// that are not covered by the DOM lib (no @types/node installed — zero new installs).

declare const process: {
	env: { [key: string]: string | undefined };
	version: string;
	platform: string;
	cwd(): string;
	[key: string]: any;
};

declare function require(module: string): any;

interface Buffer {
	from(data: any, encoding?: string): any;
	alloc(size: number): any;
	concat(list: any[]): any;
	byteLength(string: string, encoding?: string): number;
	isBuffer(obj: any): boolean;
	toString(encoding?: string): string;
	[key: string]: any;
}
declare const Buffer: Buffer;

declare module "node:crypto" {
	export function createHash(algorithm: string): {
		update(data: string): { digest(encoding?: string): string };
	};
	export function createHmac(
		algorithm: string,
		key: string,
	): { update(data: string | Uint8Array): { digest(encoding?: string): string } };
	export function timingSafeEqual(a: any, b: any): boolean;
	export function randomUUID(): string;
	export function randomBytes(size: number): any;
	export function createCipheriv(algorithm: string, key: any, iv: any): any;
	export function createDecipheriv(algorithm: string, key: any, iv: any): any;
	/**
	 * GitHub App JWT signing (RSA-SHA256). Returns an object with .update() and
	 * .sign(privateKey) -> Buffer (RSA-SHA256 signature).
	 */
	export function createSign(algorithm: string): {
		update(data: string): { sign(key: string): Buffer };
		sign(key: string): Buffer;
	};
	export function generateKeyPairSync(
		type: string,
		options: any,
	): { publicKey: string; privateKey: string };
}

declare module "node:fs" {
	export function existsSync(path: string): boolean;
	export function readFileSync(path: string, encoding?: string): string;
	export function readFile(
		path: string,
		callback: (err: any, data: any) => void,
	): void;
	export function readdirSync(path: string): string[];
	export function statSync(path: string): { isDirectory(): boolean; size: number; [key: string]: any };
	export function mkdirSync(
		path: string,
		options?: { recursive?: boolean; mode?: number },
	): void;
	export function writeFileSync(
		path: string,
		data: any,
		options?: string | { encoding?: string; mode?: number },
	): void;
	export function openSync(path: string, flags: string): number;
	export function closeSync(fd: number): void;
	export function createReadStream(path: string): any;
	export function renameSync(oldPath: string, newPath: string): void;
	export function unlinkSync(path: string): void;
	export function realpathSync(path: string): string;
	export function rmSync(
		path: string,
		options?: { recursive?: boolean; force?: boolean },
	): void;
	export function appendFileSync(path: string, data: string): void;
}

declare module "node:zlib" {
	export function crc32(data: any): number;
	export function deflateRawSync(data: any): any;
	export function inflateRawSync(data: any): any;
	export function deflateSync(data: any): any;
	export function inflateSync(data: any): any;
}

declare module "node:os" {
	export function homedir(): string;
	export function tmpdir(): string;
}

declare module "node:path" {
	export function dirname(p: string): string;
	export function join(...paths: string[]): string;
	export function resolve(...paths: string[]): string;
	export function basename(p: string, ext?: string): string;
	export function extname(p: string): string;
	export const sep: string;
}

declare module "node:url" {
	export function fileURLToPath(url: string | URL): string;
}

declare module "node:stream" {
	export class Readable {
		pipe(destination: any, options?: { end?: boolean }): void;
		on(event: string, listener: (chunk?: any) => void): this;
		end(): void;
		destroy(error?: any): void;
		static fromWeb(stream: any, options?: { objectMode?: boolean }): Readable;
	}
}

declare module "node:http" {
	export interface IncomingMessage {
		headers: Record<string, string | string[] | undefined>;
		method?: string;
		url?: string;
		on(event: string, listener: (chunk?: any) => void): void;
	}
	export interface ServerResponse {
		writeHead(statusCode: number, headers?: Record<string, string>): void;
		write(chunk: any): boolean;
		end(body?: any): void;
		setHeader(name: string, value: string | number | string[]): void;
		headersSent: boolean;
		destroyed: boolean;
	}
	export interface Server {
		listen(port: number, host: string, callback?: () => void): void;
		address(): any;
		close(callback?: () => void): void;
	}
	export function createServer(
		handler: (req: IncomingMessage, res: ServerResponse) => void,
	): Server;
}

declare module "node:test" {
	export function test(
		name: string,
		fn: (t: any) => Promise<void> | void,
	): void;
	export function before(fn: (t?: any) => Promise<void> | void): void;
	export function after(fn: (t?: any) => Promise<void> | void): void;
	export function describe(name: string, fn: () => void): void;
	export function it(name: string, fn: (t?: any) => Promise<void> | void): void;
}

declare module "node:assert" {
	export function ok(value: any, message?: string): void;
	const assert: {
		ok(value: any, message?: string): void;
		equal(actual: any, expected: any, message?: string): void;
		notEqual(actual: any, expected: any, message?: string): void;
		deepEqual(actual: any, expected: any, message?: string): void;
		match(value: string, pattern: RegExp, message?: string): void;
		doesNotThrow(fn: () => any, message?: string): void;
		throws(
			fn: () => any,
			expected?: RegExp | ((error: any) => boolean),
			message?: string,
		): void;
		rejects(
			fn: () => Promise<any>,
			expected?: RegExp | ((error: any) => boolean),
		): Promise<void>;
	};
	export default assert;
}

declare module "node:assert/strict" {
	const assert: {
		ok(value: any, message?: string): void;
		equal(actual: any, expected: any, message?: string): void;
		notEqual(actual: any, expected: any, message?: string): void;
		deepEqual(actual: any, expected: any, message?: string): void;
		match(value: string, pattern: RegExp, message?: string): void;
		doesNotThrow(fn: () => any, message?: string): void;
		throws(
			fn: () => any,
			expected?: RegExp | ((error: any) => boolean),
			message?: string,
		): void;
		rejects(
			fn: () => Promise<any>,
			expected?: RegExp | ((error: any) => boolean),
		): Promise<void>;
	};
	export default assert;
}

declare module "node:child_process" {
	export type ChildProcess = {
		stdin?: any;
		stdout?: any;
		stderr?: any;
		pid?: number;
		exitCode: number | null;
		kill(signal?: string): void;
	};
	export function spawn(
		command: string,
		args?: string[],
		options?: any,
	): ChildProcess;
	export function exec(
		command: string,
		callback?: (error: any, stdout: string, stderr: string) => void,
	): any;
	export function execFileSync(
		command: string,
		args?: string[],
		options?: any,
	): string;
}
