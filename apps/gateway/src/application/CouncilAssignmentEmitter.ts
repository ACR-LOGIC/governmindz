import { randomUUID } from "node:crypto";

export type CouncilAssignmentEventSink = (event: Record<string, unknown>) => void;

const councilAssignments = [
	{
		agentId: "FactChecker",
		role: "Fact Checker",
		task: "Inspect database schemas, primary keys, and catalog definitions across Zetaris.",
		acknowledgment: "On it. Let me check the database schemas and records.",
	},
	{
		agentId: "CloudArchitect",
		role: "Cloud Architect",
		task: "Evaluate zero-trust architecture, statement limits, and least-privilege cloud safety.",
		acknowledgment: "Got it. Reviewing zero-trust safety and boundaries.",
	},
	{
		agentId: "Synthesizer",
		role: "Synthesizer",
		task: "Reconcile claims, balance evidence uncertainty, and build unified consensus.",
		acknowledgment: "Understood. Standing by to reconcile findings and evaluate consensus.",
	},
	{
		agentId: "RivalChallenger",
		role: "Rival Challenger",
		task: "Subject findings to independent adversarial scrutiny and challenge unsupported claims.",
		acknowledgment: "I’ll take a look. Checking for unverified assumptions.",
	},
	{
		agentId: "Thinker",
		role: "Thinker Agent",
		task: "Probe operational contingency angles and boundary conditions.",
		acknowledgment: "On it. Exploring hidden governance angles and edge cases.",
	},
] as const;

export function emitCouncilAssignments(eventSink?: CouncilAssignmentEventSink): void {
	for (const assignment of councilAssignments) {
		eventSink?.({
			type: "agent_task_assigned",
			agentId: assignment.agentId,
			role: assignment.role,
			taskId: `task_${assignment.agentId}_${randomUUID()}`,
			task: assignment.task,
			acknowledgment: assignment.acknowledgment,
			timestamp: Date.now(),
		});
	}
}
