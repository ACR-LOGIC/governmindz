import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 60000,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "on",
		video: {
			mode: "on",
			size: { width: 1280, height: 720 },
		},
		screenshot: "on",
		viewport: { width: 1280, height: 720 },
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: "node --env-file=.env.local --import tsx apps/web/server.ts",
			url: "http://127.0.0.1:8787/api/models",
			reuseExistingServer: !process.env.CI,
			timeout: 30000,
		},
		{
			command: "npx vite --host 127.0.0.1 --port 5173",
			url: "http://127.0.0.1:5173",
			reuseExistingServer: !process.env.CI,
			timeout: 30000,
		},
	],
});
