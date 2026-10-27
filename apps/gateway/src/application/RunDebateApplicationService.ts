import type { RunOutput, RunParams } from "../debateRunner.js";

export interface RunDebateExecutor {
	execute(params: RunParams): Promise<RunOutput>;
}

export interface RunDebatePersistence {
	saveCompleted(conversationId: string, output: RunOutput): void | Promise<void>;
	saveFailed(conversationId: string): void | Promise<void>;
}

/**
 * Application boundary for a debate run. Delivery adapters provide the
 * executor and persistence implementations; this service owns the success /
 * failure lifecycle around the canonical runDebate use case.
 */
export class RunDebateApplicationService {
	constructor(
		private readonly executor: RunDebateExecutor,
		private readonly persistence: RunDebatePersistence,
	) {}

	async execute(params: RunParams): Promise<RunOutput> {
		try {
			const output = await this.executor.execute(params);
			if (params.conversationId) {
				await this.persistence.saveCompleted(params.conversationId, output);
			}
			return output;
		} catch (error) {
			if (params.conversationId) {
				await this.persistence.saveFailed(params.conversationId);
			}
			throw error;
		}
	}
}
