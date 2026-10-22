// Copyright (c) 2026 ACR Logic.

import type { ADKAgent } from "./ADKAgent.js";

/**
 * AgentManager handles lifecycle and registration of ADK-style agents.
 */
export class AgentManager {
	private static instance: AgentManager;
	private agents: Map<string, ADKAgent> = new Map();

	private constructor() {}

	static getInstance(): AgentManager {
		if (!AgentManager.instance) {
			AgentManager.instance = new AgentManager();
		}
		return AgentManager.instance;
	}

	registerAgent(agent: ADKAgent): void {
		this.agents.set(agent.id, agent);
		console.log(`[AgentManager] Registered: ${agent.name} (${agent.id})`);
	}

	getAgent(id: string): ADKAgent | undefined {
		return this.agents.get(id);
	}

	getAllAgents(): ADKAgent[] {
		return Array.from(this.agents.values());
	}
}

export const agentManager = AgentManager.getInstance();
