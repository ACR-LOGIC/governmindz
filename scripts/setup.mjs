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

// 2. Check and populate AUDIT_TRAIL_SECRET if empty or too short
let envContent = fs.readFileSync(envLocalPath, "utf8");
const match = envContent.match(/^\s*AUDIT_TRAIL_SECRET\s*=\s*(.*)$/m);
const existingSecret = (match?.[1] || "").trim();
if (existingSecret.length < 16) {
	const secret = randomBytes(32).toString("hex");
	if (match) {
		envContent = envContent.replace(/^\s*AUDIT_TRAIL_SECRET\s*=.*$/m, `AUDIT_TRAIL_SECRET=${secret}`);
	} else {
		envContent += `${envContent.endsWith("\n") ? "" : "\n"}AUDIT_TRAIL_SECRET=${secret}\n`;
	}
	fs.writeFileSync(envLocalPath, envContent, "utf8");
	console.log("Generated and populated secure AUDIT_TRAIL_SECRET in .env.local");
} else {
	console.log("AUDIT_TRAIL_SECRET already configured");
}

console.log("\nSetup complete!");
console.log("To start GovernMindz locally:");
console.log("  npm install");
console.log("  npm start");
console.log("\n`npm start` builds the frontend, loads .env.local, and starts the web server.");
console.log("Then open: http://127.0.0.1:8787");
