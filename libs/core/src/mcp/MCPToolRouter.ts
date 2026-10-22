// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor
// Copyright (c) 2026 ACR Logic.

/**
 * MCPToolRouter — Safe abstraction for invoking MCP tools
 *
 * Provides type-safe, risk-aware access to read-only MCP tools
 * for planning, validation, and intelligence gathering.
 *
 * All tools are read-only; no destructive operations allowed.
 * Server spawned only during planning phase, not during runtime.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { Logger } from "../kernel/Logger";
import { ModelArmorInterceptor } from "../orchestration/ModelArmorInterceptor";

export type ToolRiskLevel =
	| "read_only"
	| "safe_write"
	| "privileged_write"
	| "destructive";

export interface MCPToolDefinition {
	name: string;
	description: string;
	riskLevel: ToolRiskLevel;
	requiresApproval: boolean;
	expectedOutputType: "json" | "text" | "structured";
	utilityScore: number; // 0.0 - 1.0, base usefulness rating
	tokenCost: "low" | "medium" | "high"; // penalty signal for urgency gating
}

export interface ToolInvocationResult<T = unknown> {
	status: "success" | "error";
	data?: T;
	error?: string;
	toolName?: string;
	durationMs?: number;
}

/**
 * MCPToolRouter manages safe invocation of MCP tools.
 *
 * Responsibilities:
 * - Spawn MCP server subprocess
 * - Validate tool safety before invocation
 * - Route tool calls and collect output
 * - Parse and validate results
 * - Shutdown server cleanly
 */
export class MCPToolRouter {
	private server: ChildProcess | null = null;
	private isShuttingDown = false;

	// Define available tools with safety metadata
	private readonly AVAILABLE_TOOLS: Record<string, MCPToolDefinition> = {
		legacy_denylist_scan: {
			name: "legacy_denylist_scan",
			description: "Scan repository for forbidden legacy resources",
			riskLevel: "read_only",
			requiresApproval: false,
			expectedOutputType: "json",
			utilityScore: 0.8,
			tokenCost: "medium",
		},
		repo_inspect: {
			name: "repo_inspect",
			description: "Inspect workspace packages and metadata",
			riskLevel: "read_only",
			requiresApproval: false,
			expectedOutputType: "json",
			utilityScore: 0.7,
			tokenCost: "low",
		},
		analyze_legacy_risk: {
			name: "analyze_legacy_risk",
			description: "Analyze codebase for legacy usage patterns",
			riskLevel: "read_only",
			requiresApproval: false,
			expectedOutputType: "json",
			utilityScore: 0.6,
			tokenCost: "high",
		},
		agent_flow_analyzer: {
			name: "agent_flow_analyzer",
			description: "Analyze agent orchestration flow",
			riskLevel: "read_only",
			requiresApproval: false,
			expectedOutputType: "json",
			utilityScore: 0.9,
			tokenCost: "medium",
		},
		search_cloud_docs: {
			name: "search_cloud_docs",
			description: "Search official GCP/Firebase documentation",
			riskLevel: "read_only",
			requiresApproval: false,
			expectedOutputType: "json",
			utilityScore: 0.8,
			tokenCost: "low",
		},
	};

	constructor(
		private mcpServerPath: string = resolve(process.cwd(), "mcp/server"),
	) {
		Logger.debug("MCPToolRouter initialized", {
			mcpServerPath: this.mcpServerPath,
		});
	}

	/**
	 * List all available tools with metadata.
	 */
	listTools(): MCPToolDefinition[] {
		// Ensure we are returning the tools with the new utilityScore and tokenCost fields
		return Object.values(this.AVAILABLE_TOOLS).map((tool) => ({
			...tool,
		}));
	}

	/**
	 * Check if a tool is safe to invoke.
	 *
	 * Returns validation result with reason if unsafe.
	 */
	validateTool(toolName: string): { safe: boolean; reason?: string } {
		const tool = this.AVAILABLE_TOOLS[toolName];

		if (!tool) {
			return { safe: false, reason: `Tool not found: ${toolName}` };
		}

		// Only allow read_only tools in Phase 4
		if (tool.riskLevel !== "read_only") {
			return {
				safe: false,
				reason: `Tool ${toolName} is not read-only (risk: ${tool.riskLevel})`,
			};
		}

		if (tool.requiresApproval) {
			return {
				safe: false,
				reason: `Tool ${toolName} requires approval before use`,
			};
		}

		return { safe: true };
	}

	/**
	 * Ensure server is running.
	 *
	 * Spawns MCP server subprocess if not already running.
	 * Server communicates via stdio for simplicity.
	 */
	private async ensureServerRunning(): Promise<void> {
		if (this.server && this.server.exitCode === null) {
			return; // Already running
		}

		Logger.info("MCPToolRouter: starting MCP server");

		try {
			// Spawn MCP server: npx tsx mcp/server/src/index.ts
			this.server = spawn("npx", ["tsx", "src/index.ts"], {
				cwd: this.mcpServerPath,
				stdio: ["pipe", "pipe", "pipe"],
				timeout: 30000,
			});

			// Capture stderr for debugging
			if (this.server.stderr) {
				this.server.stderr.on("data", (data: Buffer) => {
					Logger.debug("MCPToolRouter: server stderr", {
						message: data.toString("utf8").trim(),
					});
				});
			}

			// Wait for server to be ready (short delay)
			await new Promise((resolve) => setTimeout(resolve, 500));

			if (this.server.exitCode !== null && this.server.exitCode !== undefined) {
				throw new Error(`MCP server exited with code ${this.server.exitCode}`);
			}

			Logger.info("MCPToolRouter: MCP server started");
		} catch (err) {
			this.server = null;
			Logger.error("MCPToolRouter: failed to start server", err as Error);
			throw err;
		}
	}

	/**
	 * Invoke a tool and return its output.
	 *
	 * Ensures server is running, validates tool safety,
	 * constructs request, parses response.
	 */
	async invokeTool<T = unknown>(
		toolName: string,
		args: Record<string, unknown> = {},
	): Promise<ToolInvocationResult<T>> {
		const startTime = Date.now();

		try {
			// 1. Validate tool exists and is permitted by configuration
			const validation = this.validateTool(toolName);
			if (!validation.safe) {
				return {
					status: "error",
					error: validation.reason || `Tool ${toolName} is not safe`,
					toolName,
					durationMs: Date.now() - startTime,
				};
			}

			// 2. Zero-Trust Content Validation (Model Armor)
			ModelArmorInterceptor.validateToolCall(toolName, args);

			// 3. Ensure server is running
			await this.ensureServerRunning();

			if (!this.server?.stdin) {
				return {
					status: "error",
					error: "MCP server not available",
					toolName,
					durationMs: Date.now() - startTime,
				};
			}

			// Build request (simplified MCP stdio format)
			const request = {
				jsonrpc: "2.0",
				method: "tools/call",
				params: {
					name: toolName,
					arguments: args,
				},
				id: Math.random().toString(36).substring(7),
			};

			// Write request to server stdin
			this.server.stdin.write(`${JSON.stringify(request)}\n`);

			// Wait for response (with timeout)
			const response = await this.waitForResponse(request.id);

			if (response.error) {
				return {
					status: "error",
					error: response.error.message || "Unknown error",
					toolName,
					durationMs: Date.now() - startTime,
				};
			}

			// Parse tool result
			const toolResult = response.result?.content?.[0]?.text;
			if (!toolResult) {
				return {
					status: "error",
					error: "No output from tool",
					toolName,
					durationMs: Date.now() - startTime,
				};
			}

			let parsedData: T;
			try {
				parsedData = JSON.parse(toolResult) as T;
			} catch {
				// If not JSON, return as-is
				parsedData = toolResult as T;
			}

			Logger.debug("MCPToolRouter: tool invoked successfully", {
				toolName,
				durationMs: Date.now() - startTime,
			});

			return {
				status: "success",
				data: parsedData,
				toolName,
				durationMs: Date.now() - startTime,
			};
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			Logger.error("MCPToolRouter: tool invocation failed", {
				toolName,
				error,
			});

			return {
				status: "error",
				error: `Tool invocation failed: ${error}`,
				toolName,
				durationMs: Date.now() - startTime,
			};
		}
	}

	/**
	 * Wait for a response from the MCP server.
	 *
	 * Simplified implementation: reads from stdout until matching response.
	 * Production would use proper message streaming.
	 */
	private async waitForResponse(
		requestId: string,
		timeoutMs: number = 5000,
	): Promise<any> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Tool invocation timeout (${timeoutMs}ms)`));
			}, timeoutMs);

			// In production, would listen to stdout events properly
			// For Phase 4, we accept that stdio parsing is simplified
			// and rely on server's built-in error handling
			if (this.server?.stdout) {
				const listener = (data: Buffer) => {
					clearTimeout(timeout);
					try {
						const lines = data.toString("utf8").split("\n");
						for (const line of lines) {
							if (line.trim()) {
								const response = JSON.parse(line);
								if (response.id === requestId) {
									this.server?.stdout?.removeListener("data", listener);
									resolve(response);
									return;
								}
							}
						}
					} catch (_err) {
						// If parse fails, wait for next chunk
					}
				};
				this.server.stdout.on("data", listener);
			} else {
				reject(new Error("Server stdout not available"));
			}
		});
	}

	/**
	 * Shutdown the MCP server gracefully.
	 */
	async shutdown(): Promise<void> {
		if (this.isShuttingDown || !this.server) {
			return;
		}

		this.isShuttingDown = true;

		try {
			Logger.info("MCPToolRouter: shutting down MCP server");

			if (this.server.stdin) {
				this.server.stdin.end();
			}

			// Give server 5 seconds to shutdown gracefully
			const shutdownTimeout = new Promise<void>((resolve) =>
				setTimeout(() => {
					if (this.server && this.server.exitCode === null) {
						this.server.kill("SIGTERM");
					}
					resolve();
				}, 5000),
			);

			await shutdownTimeout;

			this.server = null;
			this.isShuttingDown = false;

			Logger.info("MCPToolRouter: MCP server shut down");
		} catch (err) {
			Logger.error("MCPToolRouter: error during shutdown", err as Error);
			this.isShuttingDown = false;
			throw err;
		}
	}
}

/**
 * Export singleton instance for use across the application.
 */
export const mcpToolRouter = new MCPToolRouter();
