// TODO(build-window): zod schema validation removed from baseline (zod not installed).
// Copyright (c) 2026 ACR Logic.

import type { AgentContext, AgentResult } from "../../interfaces/IAgent.js";

export interface ADKTool<T = any> {
	name: string;
	description: string;
	schema: T;
	run: (input: T) => Promise<any>;
}

export interface ADKAgentConfig {
	id: string;
	name: string;
	model: string;
	instruction: string;
	tools?: ADKTool[];
}

export type { AgentContext, AgentResult };
