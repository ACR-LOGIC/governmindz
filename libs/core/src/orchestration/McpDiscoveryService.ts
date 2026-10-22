
import type { GravitySignals } from "../gravity/GravityFormula";
import { type MCPToolDefinition, mcpToolRouter } from "../mcp/MCPToolRouter";

export interface WeightedMcpTool {
	toolName: string;
	toolScore: number;
	penalized: boolean;
	reason?: string;
}

export class McpDiscoveryService {
	private static readonly DOMAIN_MAPPING: Record<string, string[]> = {
		firebase: ["search_cloud_docs"],
		docs: ["search_cloud_docs"],
		gcp: ["search_cloud_docs", "repo_inspect"],
		legacy: ["legacy_denylist_scan", "analyze_legacy_risk"],
		orchestration: ["agent_flow_analyzer"],
		bigquery: ["bq_query", "bq_schema", "bq_job_status"],
		notion: ["notion_read", "notion_write", "notion_sync"],
		github: ["github_diff", "github_commit", "github_pr_status"],
	};

	private static weightTools(
		tools: MCPToolDefinition[],
		signals: GravitySignals,
	): WeightedMcpTool[] {
		return tools
			.map((tool) => {
				const penalized = tool.tokenCost === "high" && signals.urgency > 0.8;
				const toolScore = penalized ? 0 : tool.utilityScore * signals.relevance;
				return {
					toolName: tool.name,
					toolScore,
					penalized,
					reason: penalized
						? "High token cost suppressed by urgency gate"
						: undefined,
				};
			})
			.sort((a, b) => b.toolScore - a.toolScore);
	}

	static async findTools(
		domain: string,
		signals?: GravitySignals,
	): Promise<WeightedMcpTool[]> {
		const toolNames =
			McpDiscoveryService.DOMAIN_MAPPING[domain.toLowerCase()] || [];
		const allTools = mcpToolRouter.listTools();

		const filteredTools = allTools.filter((tool) =>
			toolNames.includes(tool.name),
		);

		// Always return as WeightedMcpTool[]
		if (!signals) {
			return filteredTools.map((tool) => ({
				toolName: tool.name,
				toolScore: tool.utilityScore,
				penalized: false,
			}));
		}

		return McpDiscoveryService.weightTools(filteredTools, signals);
	}
}
