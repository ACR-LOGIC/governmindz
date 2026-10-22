
import type { AgentMessage } from "./AgentMessage";
import type { AgentSeat } from "./AgentSeat";

export interface SeatRespondOptions {
	inReplyTo?: AgentMessage;
	sharedContext?: string;
	contextOverride?: string;
}

export interface ISeatTransport {
	readonly mode: "in_process" | "brokered";
	listSeatIds(): string[];
	hasSeat(seatId: string): boolean;
	propose(seatId: string, task: string, round: number): Promise<AgentMessage>;
	respond(
		seatId: string,
		history: AgentMessage[],
		round: number,
		options?: SeatRespondOptions,
	): Promise<AgentMessage>;
	synthesize(
		seatId: string,
		history: AgentMessage[],
		round: number,
		instruction?: string,
	): Promise<AgentMessage>;
	failover?(seatId: string): boolean;
}

export class LocalSeatTransport implements ISeatTransport {
	readonly mode = "in_process" as const;

	constructor(
		private readonly seats: Map<string, AgentSeat>,
		private readonly fallbackSeats: Record<string, AgentSeat[]> = {},
	) {}

	listSeatIds(): string[] {
		return Array.from(this.seats.keys());
	}

	hasSeat(seatId: string): boolean {
		return this.seats.has(seatId);
	}

	async propose(
		seatId: string,
		task: string,
		round: number,
	): Promise<AgentMessage> {
		const seat = this.getSeat(seatId);
		return seat.propose(task, round);
	}

	async respond(
		seatId: string,
		history: AgentMessage[],
		round: number,
		options: SeatRespondOptions = {},
	): Promise<AgentMessage> {
		const seat = this.getSeat(seatId);
		return seat.respond(
			history,
			round,
			options.inReplyTo,
			options.sharedContext,
			options.contextOverride,
		);
	}

	async synthesize(
		seatId: string,
		history: AgentMessage[],
		round: number,
		instruction?: string,
	): Promise<AgentMessage> {
		const seat = this.getSeat(seatId);
		return seat.synthesize(history, round, instruction);
	}

	failover(seatId: string): boolean {
		const nextSeat = this.fallbackSeats[seatId]?.shift();
		if (!nextSeat) {
			return false;
		}

		this.seats.set(seatId, nextSeat);
		return true;
	}

	private getSeat(seatId: string): AgentSeat {
		const seat = this.seats.get(seatId);
		if (!seat) {
			throw new Error(`SEAT_NOT_FOUND:${seatId}`);
		}
		return seat;
	}
}
