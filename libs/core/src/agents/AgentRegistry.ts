// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor
// Copyright (c) 2026 ACR Logic.

import type { IAgent } from "../interfaces/IAgent";
import { ProviderFactory } from "../providers/ProviderFactory.js";
import { PromptRegistry } from "../services/PromptRegistry";
import { ActionItemsAgent } from "./ActionItemsAgent";
import { agentManager } from "./adk/AgentManager";
import { CloudArchitectAgent } from "./CloudArchitectAgent";
import { FactCheckerAgent } from "./FactCheckerAgent";
import { SanitizerAgent } from "./SanitizerAgent";
import { SynthesizerAgent } from "./SynthesizerAgent";

const STORAGE_KEY = "governmindz_agent_registry";

export interface AgentConfig {
	id: string;
	name: string;
	role: string;
	systemPrompt: string;
	defaultModel: Record<string, string>;
	temperature: number;
	maxTokens: number;
	active: boolean;
}

export interface AgentEntry {
	config: AgentConfig;
	agent: IAgent | null;
}

const getPromptForAgent = (id: string): string => {
	const mapping: Record<string, string> = {
		"fact-checker": "fact_checker",
		"cloud-architect": "architect",
	};
	return PromptRegistry.load(mapping[id] || id);
};

const DEFAULT_AGENTS: AgentConfig[] = [
	{
		id: "fact-checker",
		name: "Fact Checker",
		role: "Verify claims with evidence and cite sources. Challenge unsupported assertions.",
		systemPrompt: getPromptForAgent("fact-checker"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.3,
		maxTokens: 1024,
		active: true,
	},
	{
		id: "synthesizer",
		name: "Synthesizer",
		role: "Combine perspectives, find common ground, and create unified summaries.",
		systemPrompt: getPromptForAgent("synthesizer"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.6,
		maxTokens: 2048,
		active: true,
	},
	{
		id: "critic",
		name: "Critic",
		role: "Find flaws, play devil's advocate, and stress-test ideas.",
		systemPrompt: getPromptForAgent("critic"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.5,
		maxTokens: 1024,
		active: true,
	},
	{
		id: "planner",
		name: "Planner",
		role: "Break problems into steps, create roadmaps, and sequence work.",
		systemPrompt: getPromptForAgent("planner"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.4,
		maxTokens: 2048,
		active: true,
	},
	{
		id: "executor",
		name: "Executor",
		role: "Write code, draft content, and produce concrete deliverables.",
		systemPrompt: getPromptForAgent("executor"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.2,
		maxTokens: 4096,
		active: false,
	},
	{
		id: "cloud-architect",
		name: "Cloud Architect",
		role: "Specialist in GCP and Firebase infrastructure.",
		systemPrompt: getPromptForAgent("cloud-architect"),
		defaultModel: {
			google: process.env.NEMOTRON_MODEL ?? "",
		},
		temperature: 0.4,
		maxTokens: 2048,
		active: true,
	},
];

export class AgentRegistry {
	private entries: Map<string, AgentEntry> = new Map();
	private coreAgents: Map<string, IAgent> = new Map();

	constructor(autoRegister = true) {
		this._initDefaults();
		this._loadSaved();
		if (autoRegister) {
			this._registerCoreAgents();
		}
	}

	private _initDefaults(): void {
		DEFAULT_AGENTS.forEach((def) => {
			this.entries.set(def.id, { config: { ...def }, agent: null });
		});
	}

	private _loadSaved(): void {
		try {
			if (typeof localStorage === "undefined") return;
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const data = JSON.parse(saved) as Partial<AgentConfig>[];
				data.forEach((savedAgent) => {
					if (!savedAgent.id) return;
					const existing = this.entries.get(savedAgent.id);
					if (existing) {
						existing.config = { ...existing.config, ...savedAgent };
					}
				});
			}
		} catch (e) {
			console.error("[AgentRegistry] Failed to load:", e);
		}
	}

	private _registerCoreAgents(): void {
		const synth = new SynthesizerAgent();
		const fc = new FactCheckerAgent();
		const ai = new ActionItemsAgent();
		const ca = new CloudArchitectAgent();
		const san = new SanitizerAgent();
		this.coreAgents.set(synth.id, synth);
		this.coreAgents.set(fc.id, fc);
		this.coreAgents.set(ai.id, ai);
		this.coreAgents.set(ca.id, ca);
		this.coreAgents.set(san.id, san);

		// Register with ADK AgentManager
		agentManager.registerAgent(synth);
		agentManager.registerAgent(fc);
		agentManager.registerAgent(ai);
		agentManager.registerAgent(ca);
		agentManager.registerAgent(san);
	}

	register(agent: IAgent): void {
		if (this.coreAgents.has(agent.id)) {
			console.warn(`[Registry] Overwriting agent ${agent.id}`);
		}
		this.coreAgents.set(agent.id, agent);
		console.log(`[Registry] Registered Agent: ${agent.name} (${agent.id})`);
	}

	getAgent(id: string): IAgent | undefined {
		return this.coreAgents.get(id);
	}

	getAllAgents(): IAgent[] {
		return Array.from(this.coreAgents.values());
	}

	getAll(): Array<{
		id: string;
		name: string;
		role: string;
		active: boolean;
		temperature: number;
		maxTokens: number;
		hasProvider: boolean;
	}> {
		return Array.from(this.entries.values()).map((a) => ({
			id: a.config.id,
			name: a.config.name,
			role: a.config.role,
			active: a.config.active,
			temperature: a.config.temperature,
			maxTokens: a.config.maxTokens,
			hasProvider: a.agent !== null,
		}));
	}

	get(agentId: string): (AgentConfig & { hasProvider: boolean }) | null {
		const entry = this.entries.get(agentId);
		return entry
			? { ...entry.config, hasProvider: entry.agent !== null }
			: null;
	}

	getActive(): IAgent[] {
		return Array.from(this.entries.values())
			.filter((a) => a.config.active && a.agent !== null)
			.map((a) => a.agent!);
	}

	toggle(agentId: string, active: boolean): void {
		const entry = this.entries.get(agentId);
		if (!entry) throw new Error(`Agent not found: ${agentId}`);
		entry.config.active = active;
		this.save();
	}

	configure(agentId: string, updates: Partial<AgentConfig>): void {
		const entry = this.entries.get(agentId);
		if (!entry) throw new Error(`Agent not found: ${agentId}`);
		Object.assign(entry.config, updates);
		this.save();
	}

	bindProvider(
		agentId: string,
		providerConfig: { type: string; apiKey: string; model?: string },
	): void {
		const entry = this.entries.get(agentId);
		if (!entry) throw new Error(`Agent not found: ${agentId}`);
		try {
			const model =
				providerConfig.model ||
				entry.config.defaultModel[providerConfig.type] ||
				"";
			const provider = ProviderFactory.create({ ...providerConfig, model });
			entry.agent = provider as unknown as IAgent;
		} catch (error) {
			console.error(
				`[AgentRegistry] Failed to bind provider for ${agentId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			entry.agent = null;
		}
		this.save();
	}

	bindProviderToAll(providerConfig: {
		type: string;
		apiKey: string;
		model?: string;
	}): void {
		for (const [agentId] of this.entries) {
			this.bindProvider(agentId, providerConfig);
		}
	}

	hasConfiguredAgents(): boolean {
		return Array.from(this.entries.values()).some(
			(a) => a.agent !== null && a.config.active,
		);
	}

	save(): void {
		try {
			if (typeof localStorage === "undefined") return;
			const data = Array.from(this.entries.values()).map((a) => ({
				id: a.config.id,
				name: a.config.name,
				role: a.config.role,
				active: a.config.active,
				temperature: a.config.temperature,
				maxTokens: a.config.maxTokens,
				systemPrompt: a.config.systemPrompt,
			}));
			localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch (e) {
			console.error("[AgentRegistry] Failed to save:", e);
		}
	}

	reset(): void {
		this.entries.clear();
		this._initDefaults();
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(STORAGE_KEY);
		}
	}
}

export const agentRegistry: AgentRegistry = new AgentRegistry();
