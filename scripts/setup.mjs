import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const rootDir = process.cwd();
const envLocalPath = path.join(rootDir, ".env.local");
const envExamplePath = path.join(rootDir, ".env.example");

console.log("=== GovernMindz Local Setup ===");

// 1. Ensure .env.local exists
if (!fs.existsSync(envLocalPath)) {
	if (fs.existsSync(envExamplePath)) {
		fs.copyFileSync(envExamplePath, envLocalPath);
		console.log("Created .env.local from .env.example");
	} else {
		fs.writeFileSync(envLocalPath, "AUDIT_TRAIL_SECRET=\n");
		console.log("Created blank .env.local");
	}
}

// 2. Check and populate AUDIT_TRAIL_SECRET if empty
let envContent = fs.readFileSync(envLocalPath, "utf8");
if (!envContent.includes("AUDIT_TRAIL_SECRET=") || envContent.includes("AUDIT_TRAIL_SECRET=\n") || envContent.includes("AUDIT_TRAIL_SECRET=\r\n") || !envContent.match(/AUDIT_TRAIL_SECRET=[a-fA-F0-9]{32,}/)) {
	const secret = randomBytes(32).toString("hex");
	if (envContent.includes("AUDIT_TRAIL_SECRET=")) {
		envContent = envContent.replace(/AUDIT_TRAIL_SECRET=.*\r?\n/, `AUDIT_TRAIL_SECRET=${secret}\n`);
	} else {
		envContent += `\nAUDIT_TRAIL_SECRET=${secret}\n`;
	}
	fs.writeFileSync(envLocalPath, envContent, "utf8");
	console.log("Generated and populated secure AUDIT_TRAIL_SECRET in .env.local");
}

console.log("\nSetup complete!");
console.log("To start GovernMindz locally:");
console.log("  npm install");
console.log("  npm run web");
console.log("\nThen open: http://127.0.0.1:8787");
