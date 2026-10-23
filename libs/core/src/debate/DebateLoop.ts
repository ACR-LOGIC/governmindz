// biome-ignore-all lint/style/noNonNullAssertion: legacy code pending refactor

// packages/core/src/debate/DebateLoop.ts — v1.3 TRANSCRIPT-PERSISTENCE

import type { TranscriptRepository } from "../database/DatabaseService";
import { auditTrail } from "../engine/AuditTrailEmitter";
import { syncEngine } from "../integrations/syncEngine";
import type { AgentMessage } from "./AgentMessage";
import type { ISeatTransport } from "./SeatTransport";
import type { RivalChallenger } from "../memory/RivalChallenger.js";
import type { ThinkerAgent } from "../memory/ThinkerAgent.js";
import { SemanticTranscriptCompressor } from "./SemanticTranscriptCompressor";

export interface DebateConfig {
	maxRounds: number;
	consensusThreshold: number;
	minConsensusSeats: number;
	enableTieredPhases: boolean;
	dissentTriggerCount: number;
	criticalSeats?: string[];
	judgeSeatId?: string;
	requireIsolatedTransport?: boolean;
	adversarialSeatId?: string;
	transcriptCompression?: {
		maxRecentMessages?: number;
		maxEvidencePerMessage?: number;
	};
	maxActiveTranscriptMessages?: number;
	summaryIntervalRounds?: number;
	eventSink?: (event: Record<string, unknown>) => void;
	evidenceContext?: string;
	rivalChallenger?: RivalChallenger;
	thinkerAgent?: ThinkerAgent;
	inquiryScore?: number;
}

export type AndresNotifier = (payload: {
	sourceType: string;
	category: string;
	patternSummary: string;
	reusableLogic: Record<string, unknown>;
	tags: string[];
	confidence: number;
}) => Promise<void>;

export interface DebateResult {
	session_id: string;
	query_hash: string;
	transcript: AgentMessage[];
	rounds: number;
	consensusReached: boolean;
	finalConfidence: number;
	consensus_method: "threshold" | "synthesizer" | "tiebreaker" | "max_rounds";
	quarantined_seats: string[];
	seat_votes: Record<
		string,
		{ position: string; confidence: number; dissented: boolean }
	>;
	timestamp: number;
	halted: boolean;
	haltReason?: string;
	transportMode: ISeatTransport["mode"];
	compression?: {
		tokenEstimateBefore: number;
		tokenEstimateAfter: number;
		compactionCount: number;
	};
}

interface ExternalMemorySyncPayload {
	[key: string]: unknown;
	id: string;
	session_id: string;
	query_hash: string;
	content: string;
	transcript: DebateResult["transcript"];
	consensus_method: DebateResult["consensus_method"];
	finalConfidence: number;
	responses: Array<{
		agentId: string;
		agentName: string;
		content: string;
		confidence: number;
		round: number;
		evidence: string[];
		caveats: string[];
	}>;
	metadata: {
		method: DebateResult["consensus_method"];
		confidence: number;
		rounds: number;
		halted: boolean;
		haltReason?: string;
		transportMode: DebateResult["transportMode"];
		quarantinedSeats: string[];
		autoMemorySync: true;
		storageMode: "local-first";
		preferredProviders: string[];
	};
}

function formatTranscriptForStorage(
	transcript: DebateResult["transcript"],
): string {
	return transcript
		.map((message) => {
			const roundLabel = `r${message.round}`;
			return `[${roundLabel}][${message.fromSeat}->${message.toSeat}] ${message.content}`;
		})
		.join("\n");
}

export class DebateLoop {
	private transcript: AgentMessage[] = [];
	private round = 0;
	private quarantinedSeats = new Set<string>();
	private seatFailures = new Map<string, number>();
	private readonly MAX_SEAT_FAILURES = 2;
	private consensusMethod: DebateResult["consensus_method"] = "max_rounds";
	private haltReason?: string;
	private readonly compressor = new SemanticTranscriptCompressor();
	private cumulativeCompression = {
		tokenEstimateBefore: 0,
		tokenEstimateAfter: 0,
		compactionCount: 0,
	};
	private adversaryConsecutiveHighConfidence = 0;
	private challengedSeats = new Set<string>();
	private thinkerQuestionsAsked = 0;
	private thinkerCount = 0;
	private interventionLog: Array<{ agent: string; reason: string; round: number }> = [];
	private adversarialRoundsLog: Array<{
		round: number;
		targetSeatId: string;
		challengeConfidence: number;
		rebuttalConfidence: number;
	}> = [];

	constructor(
		private readonly seatIds: string[],
		private readonly transport: ISeatTransport,
		private readonly gravityRouter: (
			messages: AgentMessage[],
			round: number,
		) => string[],
		private readonly config: DebateConfig,
		private readonly transcriptRepository?: TranscriptRepository,
		private readonly topic?: string,
		private readonly andresNotifier?: AndresNotifier,
	) {}

	private emit(event: Record<string, unknown>): void {
		try {
			this.config.eventSink?.(event);
		} catch {
			// never let streaming break the debate
		}
	}

	async run(task: string): Promise<DebateResult> {
		if (
			this.config.requireIsolatedTransport &&
			this.transport.mode === "in_process"
		) {
			this.haltReason =
				"Isolated debate transport is required, but the current runtime is using in-process seat execution.";
			return this.buildResult();
		}

		if (this.config.enableTieredPhases) {
			await this.blindRound(task);
		} else {
			await this.initialProposals(task);
		}

		while (this.round < this.config.maxRounds) {
			if (this.haltReason) break;

			this.round++;
			this.emit({ type: "round_start", round: this.round });
			const activeSeats = this.gravityRouter(
				this.transcript,
				this.round,
			).filter((id) => id !== this.config.adversarialSeatId);
			const sharedPeerContext = this.buildSharedPeerContext();
			const sharedCompressedContext = this.buildSharedCompressedContext();

			for (const seatId of activeSeats) {
				if (
					this.quarantinedSeats.has(seatId) ||
					!this.transport.hasSeat(seatId)
				)
					continue;
				if (this.haltReason) break;

				this.emit({ type: "seat_thinking", seatId, round: this.round });
				try {
					const challenge = this.findOpenChallenge(seatId);
					const response = await this.transport.respond(
						seatId,
						this.transcript,
						this.round,
						{
							inReplyTo: challenge,
							sharedContext: sharedPeerContext,
							contextOverride: sharedCompressedContext,
						},
					);
					this.transcript.push(response);
					this.seatFailures.delete(seatId);
					this.emit({ type: "message", message: response });
					await this.maybeChallenge(response, this.round);
				} catch (err) {
					this.handleSeatFailure(seatId, err);
				}
			}

			await this.maybeThink(
				this.round,
				this.transcript.map((m) => m.content).join("\n"),
			);

			// Fallback: ensure every seat is challenged no later than its second response.
			if (this.config.rivalChallenger) {
				const unchallenged = this.seatIds.some(
					(id) => !this.challengedSeats.has(id),
				);
				if (unchallenged) await this.runRivalChallenges(this.round);
			}

			if (this.config.adversarialSeatId && !this.haltReason) {
				await this.runAdversarialPhase(this.round);
			}

			if (this.haltReason) {
				this.emit({ type: "halt", reason: this.haltReason });
				break;
			}

			this.compactTranscriptIfNeeded();

			const roundConsensus = this.hasConsensus();
			this.emit({ type: "round_end", round: this.round, consensus: roundConsensus });

			if (this.hasDissentThresholdBreach()) {
				await this.triggerJudgeResolution(
					"Resolve the deadlock and produce a single authoritative answer.",
				);
				this.consensusMethod = "tiebreaker";
				this.emit({ type: "consensus", method: "tiebreaker", finalConfidence: this.computeFinalConfidence() });
				break;
			}

			if (roundConsensus) {
				this.consensusMethod = "threshold";
				this.emit({ type: "consensus", method: "threshold", finalConfidence: this.computeFinalConfidence() });
				break;
			}

			if (this.hasEscalation()) {
				await this.triggerJudgeResolution(
					"Escalation requested. Produce the final unified answer.",
				);
				this.consensusMethod = "synthesizer";
				this.emit({ type: "consensus", method: "synthesizer", finalConfidence: this.computeFinalConfidence() });
				break;
			}
		}

		const result = this.buildResult();
		this.emit({ type: "complete", result });
		return result;
	}

	private async blindRound(task: string): Promise<void> {
		this.emit({ type: "round_start", round: 0 });
		for (const seatId of this.seatIds) {
			if (!this.transport.hasSeat(seatId)) continue;
			if (this.haltReason) return;
			this.emit({ type: "seat_thinking", seatId, round: 0 });
			try {
				const proposal = await this.transport.propose(seatId, task, 0);
				this.transcript.push(proposal);
				this.emit({ type: "message", message: proposal });
				await this.maybeChallenge(proposal, 0);
			} catch (err) {
				this.handleSeatFailure(seatId, err);
				if (this.haltReason) {
					this.emit({ type: "halt", reason: this.haltReason });
					return;
				}
			}
		}
		this.emit({ type: "round_end", round: 0, consensus: false });
		await this.runRivalChallenges(0);
		await this.maybeThink(0, this.transcript.map((m) => m.content).join("\n"));
	}

	private challengeCount = 0;

	private async challengeOne(
		seatId: string,
		message: AgentMessage,
		round: number,
	): Promise<void> {
		const challenger = this.config.rivalChallenger;
		if (!challenger) return;
		if (this.challengeCount >= 12) return;
		const evidenceContext = this.config.evidenceContext || "";
		this.emit({ type: "seat_thinking", seatId: "RivalChallenger", round });
		try {
			const result = await challenger.challenge(
				seatId,
				message,
				evidenceContext,
			);
			const challengeMsg: AgentMessage = {
				id: `rival-${seatId}-r${round}-${Date.now()}`,
				fromSeat: "RivalChallenger",
				toSeat: seatId,
				type: "challenge",
				content: result.challenge,
				structured: {
					position: result.correctedPosition,
					confidenceSelf: result.confidence,
					confidence_self: result.confidence,
					confidenceExpertAgreement: result.confidence,
					confidence_expert_agreement: result.confidence,
					evidence: result.verifiedClaims,
					caveats: result.unsupportedClaims,
					dissentsFrom: result.unsupportedClaims.length ? [seatId] : [],
					dissents_from: result.unsupportedClaims.length ? [seatId] : [],
					supports: [],
				},
				confidence: result.confidence,
				round,
				timestamp: Date.now(),
			};
			this.transcript.push(challengeMsg);
			this.challengedSeats.add(seatId);
			this.challengeCount++;
			this.emit({ type: "message", message: challengeMsg });
			this.emit({
				type: "rival_verification",
				seatId,
				verifiedClaims: result.verifiedClaims,
				unsupportedClaims: result.unsupportedClaims,
				correctedPosition: result.correctedPosition,
			});
		} catch (err) {
			this.handleSeatFailure("RivalChallenger", err);
		}
	}

	private async runRivalChallenges(round: number): Promise<void> {
		const challenger = this.config.rivalChallenger;
		if (!challenger) return;
		for (const seatId of this.seatIds) {
			if (this.challengedSeats.has(seatId)) continue;
			const lastMsg = [...this.transcript]
				.reverse()
				.find((m) => m.fromSeat === seatId && m.structured);
			if (!lastMsg) continue;
			await this.challengeOne(seatId, lastMsg, round);
		}
	}

	private shouldChallenge(m: AgentMessage): { challenge: boolean; reason: string } {
		const conf = m.confidence ?? 0;
		const ev = m.structured?.evidence ?? [];
		const dissents = m.structured?.dissents_from ?? m.structured?.dissentsFrom ?? [];
		const supports = m.structured?.supports ?? [];
		const claimConfs = m.structured?.claimConfidences ?? [];
		if (conf >= 0.8 && ev.length <= 1)
			return { challenge: true, reason: "overconfidence with weak evidence" };
		if (claimConfs.some((c) => c.confidence >= 0.8) && ev.length === 0)
			return { challenge: true, reason: "unsupported certainty" };
		if (dissents.length > 0)
			return { challenge: true, reason: "contradiction or source conflict" };
		if (supports.length > 0 && ev.length === 0)
			return { challenge: true, reason: "premature consensus" };
		if (conf <= 0.4)
			return { challenge: true, reason: "high uncertainty on critical claim" };
		return { challenge: false, reason: "" };
	}

	private async maybeChallenge(m: AgentMessage, round: number): Promise<void> {
		const challenger = this.config.rivalChallenger;
		if (!challenger) return;
		if (this.challengeCount >= 12) return;
		// Rival Challenger always challenges to force double-check and verification.
		const reason = "routine challenge to force verification";
		const key = m.fromSeat + "|" + (m.structured?.position || "").slice(0, 60);
		if (this.challengedClaims.has(key)) return;
		this.challengedClaims.add(key);
		this.interventionLog.push({ agent: "RivalChallenger", reason, round });
		this.emit({ type: "rival_trigger", seatId: m.fromSeat, reason, round });
		await this.challengeOne(m.fromSeat, m, round);
	}

	private async maybeThink(round: number, findings: string): Promise<void> {
		const thinker = this.config.thinkerAgent;
		if (!thinker) return;
		if (this.thinkerCount >= 2) return;
		// Trigger conditions: contradictions, research gaps, pre-finalization.
		const hasContradiction = this.transcript.some(
			(m) => (m.structured?.dissents_from?.length ?? 0) > 0,
		);
		const beforeFinal = this.hasConsensus();
		if (!hasContradiction && !beforeFinal && round > 0 && round < this.config.maxRounds) {
			// only think on round 0 or finalization unless contradiction
			if (round !== 0) return;
		}
		const sources = this.config.evidenceContext || "";
		const result = await thinker.think({
			inquiry: this.topic || "",
			findings,
			sources,
		});
		if (!result.questions || result.questions.length === 0) return;
		this.thinkerCount++;
		this.thinkerQuestionsAsked += result.questions.length;
		for (const q of result.questions) {
			const msg: AgentMessage = {
				id: `thinker-q-${round}-${Date.now()}`,
				fromSeat: "Thinker",
				toSeat: "all",
				type: "action_items",
				content: q.question,
				structured: {
					position: q.question,
					confidenceSelf: 0.7,
					confidence_self: 0.7,
					confidenceExpertAgreement: 0.7,
					confidence_expert_agreement: 0.7,
					evidence: [],
					caveats: [q.reason],
					dissents_from: [],
					supports: q.assignedTo || [],
				},
				confidence: 0.7,
				round,
				timestamp: Date.now(),
			};
			this.transcript.push(msg);
			this.emit({ type: "message", message: msg });
			this.emit({
				type: "thinker_question",
				question: q.question,
				assignedTo: q.assignedTo,
				reason: q.reason,
			});
		}
		this.interventionLog.push({
			agent: "Thinker",
			reason: result.summary,
			round,
		});
	}

	private challengedClaims = new Set<string>();

	private async initialProposals(task: string): Promise<void> {
		this.emit({ type: "round_start", round: 0 });
		for (const seatId of this.seatIds) {
			if (!this.transport.hasSeat(seatId)) continue;
			if (this.haltReason) return;
			this.emit({ type: "seat_thinking", seatId, round: 0 });
			try {
				const proposal = await this.transport.propose(seatId, task, 0);
				this.transcript.push(proposal);
				this.emit({ type: "message", message: proposal });
			} catch (err) {
				this.handleSeatFailure(seatId, err);
				if (this.haltReason) {
					this.emit({ type: "halt", reason: this.haltReason });
					return;
				}
			}
		}
		this.emit({ type: "round_end", round: 0, consensus: false });
	}

	public getAdversarialRoundsLog() {
		return this.adversarialRoundsLog;
	}

	private async runAdversarialPhase(round: number): Promise<void> {
		const adversaryId = this.config.adversarialSeatId!;
		if (
			this.quarantinedSeats.has(adversaryId) ||
			!this.transport.hasSeat(adversaryId)
		)
			return;

		const roundMessages = this.transcript.filter((m) => m.round === round);
		const candidates = roundMessages.filter(
			(m) =>
				m.fromSeat !== adversaryId &&
				m.type !== "summary" &&
				m.type !== "escalation" &&
				m.type !== "action_items",
		);
		if (!candidates.length) return;

		const weakest = candidates.reduce((min, m) =>
			(m.structured?.confidence_self ?? m.confidence ?? 0) <
			(min.structured?.confidence_self ?? min.confidence ?? 0)
				? m
				: min,
		);

		let challengeMsg: AgentMessage;
		this.emit({ type: "seat_thinking", seatId: adversaryId, round });
		try {
			challengeMsg = await this.transport.respond(
				adversaryId,
				this.transcript,
				round,
				{
					inReplyTo: weakest,
				},
			);
			challengeMsg = {
				...challengeMsg,
				type: "challenge",
				toSeat: weakest.fromSeat,
				inReplyTo: weakest.id,
			};
			this.transcript.push(challengeMsg);
			this.seatFailures.delete(adversaryId);
			this.emit({ type: "message", message: challengeMsg });
		} catch (err) {
			this.handleSeatFailure(adversaryId, err);
			return;
		}

		const attackConfidence =
			challengeMsg.structured?.confidence_self ?? challengeMsg.confidence ?? 0;
		this.checkAdversaryEscalation(attackConfidence, round, weakest.fromSeat);
		if (this.haltReason) {
			// Log the round even when escalating early — rebuttalConfidence recorded as 0
			this.adversarialRoundsLog.push({
				round,
				targetSeatId: weakest.fromSeat,
				challengeConfidence: attackConfidence,
				rebuttalConfidence: 0,
			});
			return;
		}

		const targetId = weakest.fromSeat;
		if (
			this.quarantinedSeats.has(targetId) ||
			!this.transport.hasSeat(targetId)
		)
			return;

		let rebuttalMsg: AgentMessage;
		this.emit({ type: "seat_thinking", seatId: targetId, round });
		try {
			rebuttalMsg = await this.transport.respond(
				targetId,
				this.transcript,
				round,
				{
					inReplyTo: challengeMsg,
				},
			);
			rebuttalMsg = {
				...rebuttalMsg,
				type: "refinement",
				toSeat: adversaryId,
				inReplyTo: challengeMsg.id,
			};
			this.transcript.push(rebuttalMsg);
			this.seatFailures.delete(targetId);
			this.emit({ type: "message", message: rebuttalMsg });
		} catch (err) {
			this.handleSeatFailure(targetId, err);
			return;
		}

		const rebuttalConfidence =
			rebuttalMsg.structured?.confidence_self ?? rebuttalMsg.confidence ?? 0;
		this.adversarialRoundsLog.push({
			round,
			targetSeatId: targetId,
			challengeConfidence: attackConfidence,
			rebuttalConfidence,
		});

		if (rebuttalConfidence < 0.4) {
			this.haltReason = "REBUTTAL_FAILED";
			this.transcript.push(
				this.buildEscalationMessage(
					adversaryId,
					round,
					targetId,
					attackConfidence,
					rebuttalConfidence,
				),
			);
		}
	}

	protected checkAdversaryEscalation(
		attackConfidence: number,
		round: number,
		targetSeatId: string,
	): void {
		if (attackConfidence > 0.9) {
			this.adversaryConsecutiveHighConfidence += 1;
		} else {
			this.adversaryConsecutiveHighConfidence = 0;
		}

		if (this.adversaryConsecutiveHighConfidence >= 2) {
			this.haltReason = "ADVERSARY_PERSISTENT_HIGH_CONFIDENCE";
			this.transcript.push(
				this.buildEscalationMessage(
					this.config.adversarialSeatId!,
					round,
					targetSeatId,
					attackConfidence,
					undefined,
				),
			);
		}
	}

	private buildEscalationMessage(
		fromSeat: string,
		round: number,
		targetSeatId: string,
		attackConfidence: number,
		rebuttalConfidence?: number,
	): AgentMessage {
		const id = `${fromSeat}-escalation-r${round}-${Date.now()}`;
		const content =
			rebuttalConfidence != null
				? `Adversarial escalation: attack confidence=${attackConfidence.toFixed(2)}, rebuttal confidence=${rebuttalConfidence.toFixed(2)} for target seat ${targetSeatId}.`
				: `Adversarial escalation: persistent high attack confidence=${attackConfidence.toFixed(2)} for target seat ${targetSeatId}.`;

		return {
			id,
			fromSeat,
			toSeat: "all",
			type: "escalation",
			content,
			structured: {
				position: content,
				confidenceSelf: attackConfidence,
				confidence_self: attackConfidence,
				confidenceExpertAgreement: 0.5,
				confidence_expert_agreement: 0.5,
				evidence: [],
				caveats: [],
				dissentsFrom: [targetSeatId],
				dissents_from: [targetSeatId],
				supports: [],
			},
			confidence: attackConfidence,
			round,
			timestamp: Date.now(),
		};
	}

	private buildSharedPeerContext(): string {
		return this.transcript
			.filter((message) => message.round === 0 && message.type !== "summary")
			.map(
				(message) =>
					`${message.fromSeat}: ${message.structured.position} (confidence: ${message.structured.confidence_self})`,
			)
			.join("\n");
	}

	private buildSharedCompressedContext(): string {
		const compression = this.compressor.compress(
			this.transcript,
			"__shared__",
			this.config.transcriptCompression,
		);
		this.cumulativeCompression.tokenEstimateBefore +=
			compression.tokenEstimateBefore;
		this.cumulativeCompression.tokenEstimateAfter +=
			compression.tokenEstimateAfter;
		return compression.compressedHistory;
	}

	private handleSeatFailure(seatId: string, err: unknown): void {
		const failures = (this.seatFailures.get(seatId) ?? 0) + 1;
		this.seatFailures.set(seatId, failures);

		if (failures < this.MAX_SEAT_FAILURES) {
			return;
		}

		if (this.transport.failover?.(seatId)) {
			this.seatFailures.set(seatId, 0);
			console.warn(
				`[DebateLoop] Seat ${seatId} failed over after ${failures} failures`,
				err,
			);
			return;
		}

		if (this.config.criticalSeats?.includes(seatId)) {
			this.haltReason = `Critical seat ${seatId} became unavailable after ${failures} failures.`;
			console.error(`[DebateLoop] HALTING: ${this.haltReason}`, err);
			return;
		}

		this.quarantinedSeats.add(seatId);
		console.error(
			`[DebateLoop] Seat ${seatId} QUARANTINED after ${failures} failures`,
			err,
		);
	}

	private findOpenChallenge(seatId: string): AgentMessage | undefined {
		const challenges = this.transcript.filter(
			(message) => message.toSeat === seatId && message.type === "challenge",
		);
		const answered = new Set(
			this.transcript
				.filter((message) => message.fromSeat === seatId && message.inReplyTo)
				.map((message) => message.inReplyTo),
		);
		return challenges.find((challenge) => !answered.has(challenge.id));
	}

	private hasConsensus(): boolean {
		const thisRound = this.transcript.filter(
			(message) => message.round === this.round,
		);
		const consensusMessages = thisRound.filter(
			(message) => message.type === "consensus",
		);
		if (consensusMessages.length < this.config.minConsensusSeats) return false;
		const avgConfidence =
			consensusMessages.reduce((sum, message) => sum + message.confidence, 0) /
			consensusMessages.length;
		return avgConfidence >= this.config.consensusThreshold;
	}

	private hasEscalation(): boolean {
		return this.transcript
			.filter((message) => message.round === this.round)
			.some((message) => message.type === "escalation");
	}

	private hasDissentThresholdBreach(): boolean {
		const thisRound = this.transcript.filter(
			(message) => message.round === this.round,
		);
		const dissentCount = thisRound.filter(
			(message) =>
				message.structured?.dissents_from &&
				message.structured.dissents_from.length > 0,
		).length;
		return dissentCount >= this.config.dissentTriggerCount;
	}

	private async triggerJudgeResolution(instruction: string): Promise<void> {
		const judgeSeatId = this.resolveJudgeSeatId();
		if (!judgeSeatId) {
			this.haltReason =
				"No judge or synthesizer seat is available to resolve the debate deadlock.";
			return;
		}

		try {
			this.round += 1;
			this.emit({ type: "round_start", round: this.round });
			const resolution = await this.transport.synthesize(
				judgeSeatId,
				this.transcript,
				this.round,
				`${instruction}\\n\\nUse the available evidence to declare the strongest position and return a unified answer.`,
			);
			this.transcript.push(resolution);
			this.emit({ type: "message", message: resolution });
		} catch (err) {
			this.handleSeatFailure(judgeSeatId, err);
		}
	}

	private resolveJudgeSeatId(): string | undefined {
		const candidates = [
			this.config.judgeSeatId,
			"Judge",
			"Synthesizer",
			"synthesizer",
		].filter(Boolean);
		return candidates.find(
			(seatId) => seatId && this.transport.hasSeat(seatId),
		) as string | undefined;
	}

	private compactTranscriptIfNeeded(): void {
		const maxActive = this.config.maxActiveTranscriptMessages ?? 12;
		const summaryInterval = this.config.summaryIntervalRounds ?? 2;
		const nonSummary = this.transcript.filter(
			(message) => message.type !== "summary",
		);

		if (nonSummary.length <= maxActive || this.round < summaryInterval) {
			return;
		}

		const recent = nonSummary.slice(-(maxActive - 1));
		const older = nonSummary.slice(0, -(maxActive - 1));
		if (older.length === 0) return;

		const summaryText = this.compressor.summarize(
			older,
			`Debate Summary through round ${older[older.length - 1].round}`,
		);
		const summaryMessage: AgentMessage = {
			id: `summary-${this.round}-${older.length}`,
			fromSeat: "DebateSummary",
			toSeat: "all",
			type: "summary",
			content: summaryText,
			structured: {
				position: summaryText,
				confidenceSelf: this.averageConfidence(older),
				confidence_self: this.averageConfidence(older),
				confidenceExpertAgreement: this.averageConfidence(older),
				confidence_expert_agreement: this.averageConfidence(older),
				evidence: [],
				caveats: [
					"Earlier raw transcript messages were compacted into this summary window.",
				],
				dissents_from: [],
				supports: [],
			},
			confidence: this.averageConfidence(older),
			round: older[older.length - 1].round,
			timestamp: Date.now(),
			token_count: Math.ceil(summaryText.length / 4),
		};

		this.transcript = [summaryMessage, ...recent];
		this.cumulativeCompression.compactionCount += 1;
	}

	private averageConfidence(messages: AgentMessage[]): number {
		if (messages.length === 0) return 0;
		return (
			messages.reduce((sum, message) => sum + (message.confidence ?? 0), 0) /
			messages.length
		);
	}

	private computeFinalConfidence(): number {
		const lastRound = this.transcript.filter(
			(message) => message.round === this.round,
		);
		if (lastRound.length === 0) return 0;
		return (
			lastRound.reduce((sum, message) => sum + message.confidence, 0) /
			lastRound.length
		);
	}

	private computeQueryHash(): string {
		return `qh_${Date.now().toString(36)}`;
	}

	private buildSeatVoteSummary(): DebateResult["seat_votes"] {
		const summary: DebateResult["seat_votes"] = {};
		for (const seatId of this.seatIds) {
			const lastMessage = [...this.transcript]
				.reverse()
				.find((message) => message.fromSeat === seatId && message.structured);
			if (!lastMessage) continue;

			summary[seatId] = {
				position: lastMessage.structured.position,
				confidence: lastMessage.structured.confidence_self,
				dissented: (lastMessage.structured.dissents_from?.length ?? 0) > 0,
			};
		}
		return summary;
	}

	private buildResult(): DebateResult {
		if (this.interventionLog.length > 0) {
			const summary = this.interventionLog
				.map((i) => `${i.agent}(${i.reason})`)
				.join("; ");
			const reportMsg: AgentMessage = {
				id: `uncertainty-report-${Date.now()}`,
				fromSeat: "RivalChallenger",
				toSeat: "all",
				type: "escalation",
				content: `Unresolved interventions escalated: ${summary}. Final answer carries residual uncertainty.`,
				structured: {
					position: `Unresolved interventions escalated: ${summary}. Final answer carries residual uncertainty.`,
					confidenceSelf: 0.5,
					confidence_self: 0.5,
					confidenceExpertAgreement: 0.5,
					confidence_expert_agreement: 0.5,
					evidence: [],
					caveats: [summary],
					dissents_from: [],
					supports: [],
				},
				confidence: 0.5,
				round: this.round,
				timestamp: Date.now(),
			};
			this.transcript.push(reportMsg);
			this.emit({ type: "uncertainty_report", interventions: this.interventionLog });
			this.emit({ type: "message", message: reportMsg });
		}
		const resolvedByJudgeOrSynth =
			!this.haltReason &&
			(this.consensusMethod === "synthesizer" ||
				this.consensusMethod === "tiebreaker") &&
			this.transcript[this.transcript.length - 1]?.type === "consensus";
		const result: DebateResult = {
			session_id: crypto.randomUUID(),
			query_hash: this.computeQueryHash(),
			transcript: this.transcript,
			rounds: this.round,
			consensusReached:
				resolvedByJudgeOrSynth ||
				(this.haltReason ? false : this.hasConsensus()),
			finalConfidence: this.computeFinalConfidence(),
			consensus_method: this.consensusMethod,
			quarantined_seats: Array.from(this.quarantinedSeats),
			seat_votes: this.buildSeatVoteSummary(),
			timestamp: Date.now(),
			halted: Boolean(this.haltReason),
			haltReason: this.haltReason,
			transportMode: this.transport.mode,
			compression:
				this.cumulativeCompression.tokenEstimateBefore > 0 ||
				this.cumulativeCompression.compactionCount > 0
					? this.cumulativeCompression
					: undefined,
		};
		auditTrail.emitSessionComplete(result);
		void this.syncToExternalStorage(result).catch((err) =>
			console.error("[DebateLoop] syncToExternalStorage failed:", err),
		);
		void this.persistTranscriptLocally(result).catch((err) =>
			console.error("[DebateLoop] persistTranscriptLocally failed:", err),
		);
		void this.notifyAndres(result).catch((err) =>
			console.error("[DebateLoop] andresNotify failed:", err),
		);
		return result;
	}

	private async syncToExternalStorage(result: DebateResult): Promise<void> {
		const preferredProviders = this.resolveExternalProviders();

		if (preferredProviders.length === 0) {
			console.log(
				`[Storage] No external provider connected; session ${result.session_id} remains local.`,
			);
			return;
		}

		const payload = this.buildExternalMemoryPayload(result);
		console.log(
			`[Storage] Exporting session ${result.session_id} to secure provider${preferredProviders.length === 1 ? "" : "s"}: ${preferredProviders.join(", ")}`,
		);

		const syncOperations = preferredProviders.map((provider) => {
			if (provider === "notion") {
				return syncEngine.exportSessionToNotion(payload);
			}
			return syncEngine.exportSessionToGoogleDocs(payload);
		});

		await Promise.all(syncOperations);
	}

	private buildExternalMemoryPayload(
		result: DebateResult,
	): ExternalMemorySyncPayload {
		const preferredProviders = this.resolveExternalProviders();

		return {
			id: result.session_id,
			session_id: result.session_id,
			query_hash: result.query_hash,
			content: formatTranscriptForStorage(result.transcript),
			transcript: result.transcript,
			consensus_method: result.consensus_method,
			finalConfidence: result.finalConfidence,
			responses: result.transcript.map((message) => ({
				agentId: message.fromSeat,
				agentName: message.fromSeat,
				content: message.content,
				confidence: message.confidence,
				round: message.round,
				evidence: message.structured?.evidence ?? [],
				caveats: message.structured?.caveats ?? [],
			})),
			metadata: {
				method: result.consensus_method,
				confidence: result.finalConfidence,
				rounds: result.rounds,
				halted: result.halted,
				haltReason: result.haltReason,
				transportMode: result.transportMode,
				quarantinedSeats: result.quarantined_seats,
				autoMemorySync: true,
				storageMode: "local-first",
				preferredProviders,
			},
		};
	}

	private async persistTranscriptLocally(result: DebateResult): Promise<void> {
		if (!this.transcriptRepository) return;
		await this.transcriptRepository.persistDebateSession({
			session_id: result.session_id,
			topic: this.topic ?? "",
			agents: this.seatIds,
			transcript: result.transcript,
			consensus_method: result.consensus_method,
			final_confidence: result.finalConfidence,
			rounds: result.rounds,
			consensus_reached: result.consensusReached,
			halted: result.halted,
			halt_reason: result.haltReason,
			transport_mode: result.transportMode,
		});
	}

	private async notifyAndres(result: DebateResult): Promise<void> {
		if (!this.andresNotifier) return;

		const topicKeywords = (this.topic ?? "")
			.toLowerCase()
			.split(/\W+/)
			.filter((w) => w.length > 3);

		if (result.consensusReached) {
			await this.andresNotifier({
				sourceType: "debate",
				category: "ROUTING_PATTERNS",
				patternSummary: `Debate on "${this.topic ?? "unknown"}" reached ${result.consensus_method} consensus in ${result.rounds} rounds`,
				reusableLogic: {
					topic_keywords: topicKeywords,
					consensus_method: result.consensus_method,
					rounds_to_consensus: result.rounds,
					final_confidence: result.finalConfidence,
					seat_count: result.seat_votes
						? Object.keys(result.seat_votes).length
						: this.seatIds.length,
				},
				tags: ["debate", result.consensus_method, `rounds_${result.rounds}`],
				confidence: result.finalConfidence,
			});
		}

		if (result.quarantined_seats.length > 0) {
			await this.andresNotifier({
				sourceType: "debate",
				category: "FAILURE_MODES",
				patternSummary: `Agent seat(s) quarantined mid-debate: ${result.quarantined_seats.join(", ")}`,
				reusableLogic: {
					quarantined_seats: result.quarantined_seats,
					topic_keywords: topicKeywords,
					consensus_reached: result.consensusReached,
				},
				tags: ["debate", "quarantine", "failure"],
				confidence: 0.8,
			});
		}
	}

	private resolveExternalProviders(): Array<"notion" | "gdocs"> {
		const providers: Array<"notion" | "gdocs"> = [];
		if (syncEngine.notion?.isConnected) {
			providers.push("notion");
		}
		if (syncEngine.gdocs?.isConnected) {
			providers.push("gdocs");
		}

		return providers;
	}
}
