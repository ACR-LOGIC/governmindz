import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

function backendServerPlugin(): Plugin {
	let backendProcess: ChildProcess | null = null;

	const checkPort = (port: number): Promise<boolean> => {
		return new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(400);
			socket.once("error", () => {
				socket.destroy();
				resolve(false);
			});
			socket.once("timeout", () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, "127.0.0.1", () => {
				socket.end();
				resolve(true);
			});
		});
	};

	return {
		name: "governmindz-backend-launcher",
		async configureServer(server) {
			const isRunning = await checkPort(8787);
			if (!isRunning) {
				console.log("\n[governmindz] Spawning backend API server on http://127.0.0.1:8787...");
				backendProcess = spawn(
					process.execPath,
					["--import", "tsx", path.resolve(process.cwd(), "apps/web/server.ts")],
					{
						stdio: "inherit",
						env: process.env,
						cwd: process.cwd(),
					}
				);

				backendProcess.on("error", (err) => {
					console.error("[governmindz] Failed to spawn backend server:", err);
				});
			} else {
				console.log("\n[governmindz] Backend API server already active on http://127.0.0.1:8787");
			}

			const cleanup = () => {
				if (backendProcess && !backendProcess.killed) {
					try {
						backendProcess.kill();
					} catch {
						// ignore
					}
					backendProcess = null;
				}
			};

			process.once("exit", cleanup);
			process.once("SIGINT", () => {
				cleanup();
				process.exit();
			});
			process.once("SIGTERM", () => {
				cleanup();
				process.exit();
			});
			server.httpServer?.once("close", cleanup);
		},
	};
}

export default defineConfig({
	root: "apps/web",
	plugins: [react(), tailwindcss(), backendServerPlugin()],
	resolve: {
		alias: {
			"@governmindz/core": path.resolve(process.cwd(), "libs/core/src/index.ts"),
			"@governmindz/core/*": path.resolve(process.cwd(), "libs/core/src/*"),
			"@governmindz/voice": path.resolve(process.cwd(), "libs/voice/src/index.ts"),
			"@": path.resolve(process.cwd(), "apps/web/src"),
		},
	},
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8787",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: path.resolve(process.cwd(), "apps/web/dist"),
		emptyOutDir: true,
		rolldownOptions: {
			external: [
				"@playwright/test",
				"playwright-core",
				"chromium-bidi",
				"ws",
				"mime",
				"debug",
				"proxy-from-env",
				"attract-map",
				"rzs",
				"tough-cookie",
				"uuid",
				"yazl",
			],
		},
	},
});
