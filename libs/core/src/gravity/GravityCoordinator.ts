
import {
	McpDiscoveryService,
	type WeightedMcpTool,
} from "../orchestration/McpDiscoveryService";
import { ModelArmorInterceptor } from "../orchestration/ModelArmorInterceptor";
import type { Card } from "../types";
import {
	applyRoleDecay,
	calculateGravityValue,
	getOrbitalZoneWeight,
} from "./GravityFormula";
import { type GravityReceipt, mintGravityReceipt } from "./GravityReceipt";

export interface GravityNode {
	id: string;
	agent: string;
	input: string;
	gravity: number;
}

export interface GravityEdge {
	from: string;
	to: string;
}

export interface GravityGraph {
	rootId: string;
	gravity: number;
	nodes: GravityNode[];
	edges: GravityEdge[];
}

export interface GravityExecutionPackage {
	graph: GravityGraph;
	receipt: GravityReceipt;
	tools: WeightedMcpTool[];
	traceId?: string;
}

export class GravityCoordinator {
	/**
	 * Maps a set of UI cards to an executable task graph.
	 * Uses the card's mass (priorityScore) and status to influence gravity values.
	 */
	createExecutionGraph(sourceCard: Card): GravityGraph {
		console.log(`[Gravity] Coordinating graph for card: ${sourceCard.title}`);

		const basePriority = sourceCard.priorityScore || 5;
		const status = sourceCard.status ?? "inbox";
		const orbitalZoneWeight = getOrbitalZoneWeight(status);

		const gravityValue = calculateGravityValue(basePriority, orbitalZoneWeight);

		return {
			rootId: sourceCard.id,
			gravity: gravityValue,
			nodes: [
				{
					id: "t1",
					agent: "researcher",
					input: `Research context for: ${sourceCard.title}`,
					gravity: applyRoleDecay(gravityValue, "RESEARCHER"),
				},
				{
					id: "t2",
					agent: "fact_checker",
					input: `Verify source context: ${sourceCard.title}`,
					gravity: applyRoleDecay(gravityValue, "FACT_CHECKER"),
				},
				{
					id: "t3",
					agent: "fact_checker",
					input: `Verify extracted tasks align with source: ${sourceCard.title}`,
					gravity: applyRoleDecay(gravityValue, "FACT_CHECKER"),
				},
				{
					id: "t4",
					agent: "synthesizer",
					input: `Synthesize verified findings for: ${sourceCard.title}`,
					gravity: applyRoleDecay(gravityValue, "SYNTHESIZER"),
				},
			],
			edges: [
				{ from: "t1", to: "t2" },
				{ from: "t1", to: "t3" },
				{ from: "t2", to: "t4" },
				{ from: "t3", to: "t4" },
			],
		};
	}

	/**
	 * Orchestrates the full Gravity-to-execution package including verifiable receipts.
	 */
	async packageForExecution(
		sourceCard: Card,
		traceId?: string,
	): Promise<GravityExecutionPackage> {
		const gravityGraph = this.createExecutionGraph(sourceCard);

		const gravitySignals = {
			urgency: sourceCard.status === "now" ? 0.9 : 0.5,
			dependencyWeight: 0.5,
			relevance: 1.0,
			confidence: 1.0,
		};

		const domain =
			(sourceCard as Card & { domain?: string }).domain ||
			sourceCard.type ||
			"gcp";
		const weightedTools = await McpDiscoveryService.findTools(
			domain,
			gravitySignals,
		);

		const armorApprovedTools = weightedTools.filter((tool) => {
			const result = ModelArmorInterceptor.validateWithGravitySignals(
				tool.toolName,
				{},
				gravitySignals,
			);
			return result.approved;
		});

		const topTools = armorApprovedTools.filter((t) => !t.penalized).slice(0, 3);

		const receipt = mintGravityReceipt({
			taskId: sourceCard.id,
			appliedSignals: gravitySignals,
			calculatedGravity: gravityGraph.gravity,
			adkExecutionId: `adk-${Date.now()}`,
			mcpToolReceipts: topTools.map((t) => t.toolName),
			modelArmorShieldId: `armor-${gravitySignals.confidence.toFixed(2)}-${Date.now()}`,
		});

		return {
			graph: gravityGraph,
			receipt,
			tools: weightedTools,
			traceId,
		};
	}
}
