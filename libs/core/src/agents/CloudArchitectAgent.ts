// Copyright (c) 2026 ACR Logic.

import { ADKAgent } from "./adk/ADKAgent.js";

/**
 * CloudArchitectAgent - Specialist in GCP and Firebase infrastructure.
 *
 * Authorized to use Platform MCP tools for infrastructure analysis
 * and orchestration.
 */
export class CloudArchitectAgent extends ADKAgent {
	constructor() {
		super({
			id: "cloud-architect",
			name: "Cloud Architect",
			model: process.env.NEMOTRON_MODEL ?? "",
			instruction:
				"You are the Cloud Architect. Your job is to manage, analyze, and orchestrate GCP and Firebase infrastructure. You use MCP tools to gather state and propose changes.",
			tools: [], // Tools will be injected via McpDiscoveryService
		});
	}
}
