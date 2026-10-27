import type { ILLMClient } from "@governmindz/core/debate/AgentSeat";
import { RivalChallenger } from "@governmindz/core/memory/RivalChallenger";
import { ThinkerAgent } from "@governmindz/core/memory/ThinkerAgent";
import type { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";

export interface DebateSupportAgentFactoryDependencies {
	createMeterlessClient(provider: MeterlessProvider, model?: string): ILLMClient;
	createRivalChallenger(client: ILLMClient): RivalChallenger;
	createThinkerAgent(client: ILLMClient): ThinkerAgent;
}

export interface DebateSupportAgentFactoryOptions {
	mode: "sample" | "live";
	topic: string;
	provider: MeterlessProvider | null;
	model?: string;
	delayMs: number;
}

export interface DebateSupportAgents {
	rivalChallenger: RivalChallenger;
	thinkerAgent: ThinkerAgent;
}

export class DebateSupportAgentFactory {
	constructor(private readonly dependencies: DebateSupportAgentFactoryDependencies) {}

	create(options: DebateSupportAgentFactoryOptions): DebateSupportAgents {
		let challengerClient: ILLMClient;
		let thinkerClient: ILLMClient;

		if (options.mode === "sample") {
			challengerClient = {
				complete: async (_system, prompt) => {
					if (options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
					const hasContradiction = /conflict|dispute|contradiction|disagree|breach/i.test(prompt);
					return hasContradiction
						? {
								content: JSON.stringify({
									challenge: "Adversarial Challenge: Evidence conflicts with primary catalog schema or authorization rules.",
									verifiedClaims: [],
									unsupportedClaims: ["Conflicting claim requires verified cryptographic receipt"],
									correctedPosition: "Align claim with verified database metadata before continuing.",
									confidence: 0.85,
								}),
								confidence: 0.85,
							}
						: {
								content: JSON.stringify({
									challenge: "",
									verifiedClaims: ["Evidence verified against catalog"],
									unsupportedClaims: [],
									correctedPosition: "",
									confidence: 0.9,
								}),
								confidence: 0.9,
							};
				},
			};

			thinkerClient = {
				complete: async () => {
					if (options.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
					const isClinic = /clinic|scheduling|acuity|or1|cardiac|patient|hospital/i.test(options.topic);
					const isGovernance = /governance|database|lightning|zetaris|finance/i.test(options.topic);
					let questionText = "@FactChecker @CloudArchitect — Good initial proposals, but let us probe an edge case: what are our contingency protocols and secondary review procedures before we finalize this consensus?";
					let questionReason = "Edge-case contingency and policy limit verification.";
					if (isClinic) {
						questionText = "@FactChecker @CloudArchitect — Solid initial triage, but let us probe an edge case before we lock this down: what is our protocol if severe transit or weather delays hit the 15-minute ICU transfer for REQ-704? Do we have a backup intermediate care telemetry bed reserved to hold them safely?";
						questionReason = "Contingency risk: transit and weather delays could impact ICU transfer timeline.";
					} else if (isGovernance) {
						questionText = "@FactChecker @CloudArchitect — Before we lock in consensus, what are our secondary access review procedures and retention schedules for the confidential finance_demo source? Are there policy override exceptions we need to document?";
						questionReason = "Unexplored governance angle: retention schedules and access review audit frequencies.";
					}
					return {
						content: JSON.stringify({
							questions: [{ question: questionText, assignedTo: ["FactChecker", "CloudArchitect"], reason: questionReason }],
							summary: "Probed critical contingency protocol and retention boundaries.",
						}),
						confidence: 0.88,
					};
				},
			};
		} else {
			if (!options.provider) throw new Error("Meterless provider is required outside sample mode.");
			challengerClient = this.dependencies.createMeterlessClient(options.provider, options.model);
			thinkerClient = challengerClient;
		}

		return {
			rivalChallenger: this.dependencies.createRivalChallenger(challengerClient),
			thinkerAgent: this.dependencies.createThinkerAgent(thinkerClient),
		};
	}
}
