import { AgentSeat, type ILLMClient, type SeatConfig } from "@governmindz/core/debate/AgentSeat";
import type { MeterlessProvider } from "@governmindz/core/providers/MeterlessProvider";
import type { SampleReply, SampleScenario } from "../sampleScenario.js";

export interface DebateSeatFactoryDependencies {
	loadPrompt(name: string): string;
	createSampleClient(seatId: string, replies: SampleReply[], delayMs: number): ILLMClient;
	createMeterlessClient(provider: MeterlessProvider, model?: string): ILLMClient;
}

export interface DebateSeatFactoryOptions {
	provider: MeterlessProvider | null;
	scenario?: SampleScenario;
	seatModel?: string;
	sampleDelayMs: number;
}

export class DebateSeatFactory {
	constructor(private readonly dependencies: DebateSeatFactoryDependencies) {}

	create(options: DebateSeatFactoryOptions): AgentSeat[] {
		const configs: SeatConfig[] = [
			{ seatId: "FactChecker", role: "fact_checker", provider: "meterless", systemPrompt: this.dependencies.loadPrompt("fact_checker") },
			{ seatId: "CloudArchitect", role: "cloud-architect", provider: "meterless", systemPrompt: this.dependencies.loadPrompt("architect") },
			{ seatId: "Synthesizer", role: "synthesizer", provider: "meterless", systemPrompt: this.dependencies.loadPrompt("synthesizer") },
		];

		return configs.map((config) => {
			if (options.scenario) {
				return new AgentSeat(
					config,
					this.dependencies.createSampleClient(
						config.seatId,
						options.scenario.seats[config.seatId] ?? [],
						options.sampleDelayMs,
					),
				);
			}

			if (!options.provider) throw new Error("Meterless provider is required outside sample mode.");
			return new AgentSeat(config, this.dependencies.createMeterlessClient(options.provider, options.seatModel));
		});
	}
}
