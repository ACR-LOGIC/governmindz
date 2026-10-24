import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
	root: "apps/web",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@governmindz/core": path.resolve(process.cwd(), "libs/core/src/index.ts"),
			"@governmindz/core/*": path.resolve(process.cwd(), "libs/core/src/*"),
			"@": path.resolve(process.cwd(), "apps/web/src"),
		},
	},
	server: {
		port: 5173,
		proxy: {
			"/api": {
				target: "http://localhost:8787",
				changeOrigin: true,
			},
		},
	},
	build: {
		outDir: path.resolve(process.cwd(), "apps/web/dist"),
		emptyOutDir: true,
	},
});
