// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor

import { AuditEvent } from "../engine/AuditTrailEmitter";
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "./AgentMessage";

// ============================================================
// Model capability descriptor
// ============================================================

interface ModelCapability {
	modelId: string;
	contextWindow: number;
	maxTokens: number;
	specialization?: "reasoning" | "creative" | "analysis" | "coding";
	averageLatencyMs: number;
	averageTokenCost: number;
	qualityScore: number; // 1-10, benchmarked against fixed question set
}

// ============================================================
// Model benchmark result
// ============================================================

interface ModelBenchmark {
	modelId: string;
	question: string;
	evidence: string[];
	latencyMs: number;
	tokenUsage: number;
	qualityScore: number; // 1-10, based on human/automated evaluation
	factualSupport: string[]; // claims supported by evidence
	consensusContribution: "supports" | "contradicts" | "neutral";
}

// ============================================================
// MultiModelRouter
// ============================================================

export class MultiModelRouter {
	private modelRegistry: Map<string, ModelCapability> = new Map();
	private benchmarkResults: ModelBenchmark[] = [];
	private routingPolicy: "sequential" | "parallel" | "fallback" = "sequential";
	private maxConcurrent: number = 3;
	private timeoutMs: number = 30000;

	// Register a model with its capabilities
	registerModel(capability: ModelCapability): void {
		this.modelRegistry.set(capability.modelId, capability);
	}

	// Set the routing policy
	setRoutingPolicy(policy: "sequential" | "parallel" | "fallback": void {
		this.routingPolicy = policy;
	}

	// Set maximum concurrent inferences
	setMaxConcurrent(count: number): void {
		this.maxConcurrent = count;
	}

	// Set timeout for individual model inferences
	setTimeoutMs(ms: number): void {
		this.timeoutMs = ms;
	}

	// Benchmark a model against a fixed question set and evidence inputs
	benchmarkModel(
		modelId: string,
		question: string,
		evidence: string[],
	): ModelBenchmark {
		const startTime = Date.now();

		// Simulate model inference (in production, this would call the actual model)
		const latencyMs = this.simulateLatency(modelId);
		const tokenUsage = this.simulateTokenUsage(question.length, evidence.length);
		const qualityScore = this.benchmarkQuality(question, evidence);
		const factualSupport = this.extractFactualSupport(question, evidence);
		const consensusContribution = this.determineConsensusContribution(
			qualityScore,
			factualSupport,
		);

		const endTime = Date.now();
		const benchmark: ModelBenchmark = {
			modelId,
			question,
			evidence,
			latencyMs,
			tokenUsage,
			qualityScore,
			factualSupport,
			consensusContribution,
		};

		this.benchmarkResults.push(benchmark);
		return benchmark;
	}

	// Compare models on the same fixed question set
	compareModels(question: string, evidence: string[]): ModelBenchmark[] {
		const results: ModelBenchmark[] = [];

		for (const [modelId, capability] of this.modelRegistry.entries()) {
			const result = this.benchmarkModel(modelId, question, evidence);
			results.push(result);
		}

		// Sort by quality score descending
		return results.sort((a, b) => b.qualityScore - a.qualityScore);
	}

	// Route inquiries across models based on the configured policy
	async routeInquiry(
		question: string,
		evidence: string[],
	): Promise<{
		selectedModels: string[];
		consensus: "supports" | "contradicts" | "neutral";
		finalConfidence: number;
		latencyMs: number;
		tokenUsage: number;
	}> {
		const modelIds = Array.from(this.modelRegistry.keys());

		switch (this.routingPolicy) {
			case "sequential":
				return this.routeSequential(question, evidence, modelIds);
			case "parallel":
				return this.routeParallel(question, evidence, modelIds);
			case "fallback":
				return this.routeFallback(question, evidence, modelIds);
			default:
				return this.routeSequential(question, evidence, modelIds);
		}
	}

	private async routeSequential(
		question: string,
		evidence: string[],
		modelIds: string[],
	): Promise<{
		selectedModels: string[];
		consensus: "supports" | "contradicts" | "neutral";
		finalConfidence: number;
		latencyMs: number;
		tokenUsage: number;
	}> {
		const selectedModels: string[] = [];
		let combinedConfidence = 0;
		let totalTokens = 0;
		let totalLatency = 0;
		let consensus: "supports" | "contradicts" | "neutral" = "neutral";

		for (const modelId of modelIds) {
			if (selectedModels.length >= this.maxConcurrent) break;

			const capability = this.modelRegistry.get(modelId);
			if (!capability) continue;

			// Benchmark this model for this inquiry
			const result = this.benchmarkModel(modelId, question, evidence);

			selectedModels.push(modelId);
			combinedConfidence += result.qualityScore;
			totalTokens += result.tokenUsage;
			totalLatency += result.latencyMs;

			// Update consensus based on contribution
			if (result.consensusContribution === "supports") {
				consensus = consensus === "contradicts" ? "neutral" : "supports";
			} else if (result.consensusContribution === "contradicts") {
				consensus = consensus === "supports" ? "neutral" : "contradicts";
			}
		}

		const finalConfidence =
			selectedModels.length > 0 ? combinedConfidence / selectedModels.length : 0;

		return {
			selectedModels,
			consensus,
			finalConfidence,
			latencyMs: totalLatency,
			tokenUsage: totalTokens,
		};
	}

	private async routeParallel(
		question: string,
		evidence: string[],
		modelIds: string[],
	): Promise<{
		selectedModels: string[];
		consensus: "supports" | "contradicts" | "neutral";
		finalConfidence: number;
		latencyMs: number;
		tokenUsage: number;
	}> {
		// Parallel routing: run models concurrently up to maxConcurrent limit
		const selectedModels: string[] = [];
		let combinedConfidence = 0;
		let totalTokens = 0;
		let totalLatency = 0;
		let consensus: "supports" | "contradicts" | "neutral" = "neutral";

		// Run models in batches respecting maxConcurrent
		const batchSize = this.maxConcurrent;
		const modelBatches: string[][] = [];

		for (let i = 0; i < modelIds.length; i += batchSize) {
			modelBatches.push(modelIds.slice(i, i + batchSize));
		}

		for (const batch of modelBatches) {
			// Process batch in parallel
			const promises = batch.map((modelId) =>
				this.benchmarkModel(modelId, question, evidence),
			);

			const batchResults = await Promise.all(promises);

			for (const result of batchResults) {
				selectedModels.push(result.modelId);
				combinedConfidence += result.qualityScore;
				totalTokens += result.tokenUsage;
				totalLatency += result.latencyMs;

				if (result.consensusContribution === "supports") {
					consensus = consensus === "contradicts" ? "neutral" : "supports";
				} else if (result.consensusContribution === "contradicts") {
					consensus = consensus === "supports" ? "contradicts" : "neutral";
				}
			}
		}

		const finalConfidence =
			selectedModels.length > 0 ? combinedConfidence / selectedModels.length : 0;

		return {
			selectedModels,
			consensus,
			finalConfidence,
			latencyMs: totalLatency,
			tokenUsage: totalTokens,
		};
	}

	private routeFallback(
		question: string,
		evidence: string[],
		modelIds: string[],
	): Promise<{
		selectedModels: string[];
		consensus: "supports" | "contradicts" | "neutral";
		finalConfidence: number;
		latencyMs: number;
		tokenUsage: number;
	}> {
		// Fallback: try models in order of quality score, fall back on failure
		const sortedModels = modelIds
			.map((id) => ({ id, capability: this.modelRegistry.get(id) }))
			.filter((m): m is { id: string; capability: ModelCapability | undefined } =>
				m.capability !== undefined,
			)
			.sort((a, b) => b.capability!.qualityScore - a.capability!.qualityScore);

		const selectedModels: string[] = [];
		let combinedConfidence = 0;
		let totalTokens = 0;
		let totalLatency = 0;
		let consensus: "supports" | "contradicts" | "neutral" = "neutral";

		for (const { id, capability } of sortedModels) {
			if (selectedModels.length >= this.maxConcurrent) break;

			try {
				const result = this.benchmarkModel(id, question, evidence);

				selectedModels.push(id);
				combinedConfidence += result.qualityScore;
				totalTokens += result.tokenUsage;
				totalLatency += result.latencyMs;

				if (result.consensusContribution === "supports") {
					consensus = consensus === "contradicts" ? "neutral" : "supports";
				} else if (result.consensusContribution === "contradicts") {
					consensus = consensus === "supports" ? "contradicts" : "neutral";
				}
			} catch (error) {
				// Model failed, try next one (fallback)
				console.warn(`Model ${id} failed, falling back:`, error);
			}
		}

		const finalConfidence =
			selectedModels.length > 0 ? combinedConfidence / selectedModels.length : 0;

		return {
			selectedModels,
			consensus,
			finalConfidence,
			latencyMs: totalLatency,
			tokenUsage: totalTokens,
		};
	}

	// Get benchmark results
	getBenchmarkResults(): ModelBenchmark[] {
		return [...this.benchmarkResults];
	}

	getModelRegistry(): Map<string, ModelCapability> {
		return new Map(this.modelRegistry);
	}

	// Simulate latency (replace with actual model inference in production)
	private simulateLatency(modelId: string): number {
		const baseLatencies: Record<string, number> = {
			"meterless/auto": 1500,
			"nvidia/nemotron-3.5-lightning-30b-a3b": 2500,
			"local-runtime/llama-3.2-3b-instruct": 800,
		};
		return (baseLatencies[modelId] || 2000) + Math.random() * 500;
	}

	// Simulate token usage (replace with actual token counting in production)
	private simulateTokenUsage(questionLen: number, evidenceLen: number): number {
		return Math.floor(questionLen / 4) + Math.floor(evidenceLen / 4) + Math.random() * 50;
	}

	// Benchmark quality score (replace with actual evaluation in production)
	private benchmarkQuality(question: string, evidence: string[]): number {
		// Simple heuristic: more evidence + longer question = higher score
		const baseScore = 5;
		const evidenceFactor = Math.min(evidence.length / 5, 1) * 2; // up to +2 points
		const questionFactor = Math.min(question.length / 200, 1) * 1; // up to +1 point
		return Math.round(baseScore + evidenceFactor + questionFactor);
	}

	// Extract factual support claims (replace with actual NLP in production)
	private extractFactualSupport(question: string, evidence: string[]): string[] {
		const supported: string[] = [];
		for (let i = 0; i < Math.min(evidence.length, 3); i++) {
			supported.push(`claim_${i + 1}_supported_by_evidence`);
		}
		return supported;
	}

	// Determine consensus contribution based on quality and support
	private determineConsensusContribution(
		qualityScore: number,
		factualSupport: string[],
	): "supports" | "contradicts" | "neutral" {
		if (qualityScore >= 8 && factualSupport.length > 0) {
			return "supports";
		} else if (qualityScore <= 3) {
			return "contradicts";
		}
		return "neutral";
	}
}

// Export a convenience factory
export function createMultiModelRouter(): MultiModelRouter {
	const router = new MultiModelRouter();
	// Register default Meterless models
	router.registerModel({
		modelId: "meterless/auto",
		contextWindow: 32768,
		maxTokens: 4096,
		specialization: "reasoning",
		averageLatencyMs: 1500,
		averageTokenCost: 0.002,
		qualityScore: 7,
	});
	router.registerModel({
		modelId: "nvidia/nemotron-3.5-lightning-30b-a3b",
		contextWindow: 8192,
		maxTokens: 2048,
		specialization: "reasoning",
		averageLatencyMs: 2500,
		averageTokenCost: 0.01,
		qualityScore: 8,
	});
	router.setRoutingPolicy("sequential");
	router.setMaxConcurrent(3);
	router.setTimeoutMs(30000);
	return router;
}