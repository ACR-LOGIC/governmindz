import zlib from "node:zlib";
import { createHash } from "node:crypto";

export interface ZipEntry {
	path: string;
	content: string | Buffer;
}

export interface ZipManifestFile {
	path: string;
	sizeBytes: number;
	sha256: string;
}

export function sha256Hex(data: string | Buffer): string {
	const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
	return createHash("sha256").update(buffer).digest("hex");
}

export function normalizeZipPath(entryPath: string): string {
	const normalized = entryPath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+/g, "/")
		.trim();
	if (!normalized || normalized === "." || normalized === ".." || normalized.includes("../")) {
		throw new Error(`Invalid archive path: ${entryPath}`);
	}
	return normalized;
}

/**
 * Minimal deterministic ZIP writer using Node's built-in zlib.
 * Generates standard local headers, a central directory, and EOCD.
 */
export function createZipBuffer(files: ZipEntry[]): Buffer {
	if (!Array.isArray(files) || files.length === 0) {
		throw new Error("Cannot create an empty ZIP archive.");
	}

	const seen = new Set<string>();
	const localHeaders: Buffer[] = [];
	const centralHeaders: Buffer[] = [];
	let offset = 0;

	for (const file of files) {
		const entryPath = normalizeZipPath(file.path);
		if (seen.has(entryPath)) throw new Error(`Duplicate archive path: ${entryPath}`);
		seen.add(entryPath);

		const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
		const uncompressedSize = data.length;
		const crc = zlib.crc32(data);
		const compressed = zlib.deflateRawSync(data);
		const compressedSize = compressed.length;
		const nameBuf = Buffer.from(entryPath, "utf8");

		const localHeader = Buffer.alloc(30 + nameBuf.length);
		localHeader.writeUInt32LE(0x04034b50, 0);
		localHeader.writeUInt16LE(20, 4);
		localHeader.writeUInt16LE(0x0800, 6);
		localHeader.writeUInt16LE(8, 8);
		localHeader.writeUInt16LE(0, 10);
		localHeader.writeUInt16LE(0, 12);
		localHeader.writeUInt32LE(crc, 14);
		localHeader.writeUInt32LE(compressedSize, 18);
		localHeader.writeUInt32LE(uncompressedSize, 22);
		localHeader.writeUInt16LE(nameBuf.length, 26);
		localHeader.writeUInt16LE(0, 28);
		nameBuf.copy(localHeader, 30);

		const centralHeader = Buffer.alloc(46 + nameBuf.length);
		centralHeader.writeUInt32LE(0x02014b50, 0);
		centralHeader.writeUInt16LE(20, 4);
		centralHeader.writeUInt16LE(20, 6);
		centralHeader.writeUInt16LE(0x0800, 8);
		centralHeader.writeUInt16LE(8, 10);
		centralHeader.writeUInt16LE(0, 12);
		centralHeader.writeUInt16LE(0, 14);
		centralHeader.writeUInt32LE(crc, 16);
		centralHeader.writeUInt32LE(compressedSize, 20);
		centralHeader.writeUInt32LE(uncompressedSize, 24);
		centralHeader.writeUInt16LE(nameBuf.length, 28);
		centralHeader.writeUInt16LE(0, 30);
		centralHeader.writeUInt16LE(0, 32);
		centralHeader.writeUInt16LE(0, 34);
		centralHeader.writeUInt16LE(0, 36);
		centralHeader.writeUInt32LE(0, 38);
		centralHeader.writeUInt32LE(offset, 42);
		nameBuf.copy(centralHeader, 46);

		localHeaders.push(localHeader, compressed);
		centralHeaders.push(centralHeader);
		offset += localHeader.length + compressedSize;
	}

	const centralDirOffset = offset;
	const centralDirSize = centralHeaders.reduce((sum, header) => sum + header.length, 0);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(0, 4);
	eocd.writeUInt16LE(0, 6);
	eocd.writeUInt16LE(files.length, 8);
	eocd.writeUInt16LE(files.length, 10);
	eocd.writeUInt32LE(centralDirSize, 12);
	eocd.writeUInt32LE(centralDirOffset, 16);
	eocd.writeUInt16LE(0, 20);

	return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}
