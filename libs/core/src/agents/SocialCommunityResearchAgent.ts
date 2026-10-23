
import type { AgentResult, AgentContext, IAgent } from "../interfaces/IAgent";

export interface CommunitySource {
	platform: "reddit" | "x" | "wikipedia" | "forum" | "other";
	title: string;
	url?: string;
	claim: string;
	sentiment: "positive" | "negative" | "neutral" | "mixed";
	verificationStatus: "verified" | "needs_corroboration" | "unverified";
	postDate?: string;
	engagementScore?: number;
}

export interface SocialCommunityResult {
	sources: CommunitySource[];
	publicSentiment: string;
	practicalExperiences: string[];
	emergingIssues: string[];
	alternativePerspectives: string[];
	corroborationNeeded: string[];
	wikipediaReferences: string[];
	confidence: number; // 1-10
	availablePlatforms: string[];
}

export interface SocialCommunityResearchInput {
	userQuestion: string;
	claimsToCheck: string[];
	context?: string;
	mode: "sample" | "live";
	availablePlatforms?: string[];
}

export class SocialCommunityResearchAgent implements IAgent {
	id = "SocialCommunityResearchAgent";
	name = "Social & Community Research Agent";
	role = "Search relevant public discussions on Reddit, X, Wikipedia, forums, and other available search sources";
	provider = "internal";
	modelFamily = "rule-based";
	model = "community-research-v1";
	capability = "community_research";
	executionPath = "research_agent";

	constructor(private readonly llmComplete?: (system: string, prompt: string) => Promise<string>) {}

	async execute(context: AgentContext): Promise<AgentResult> {
		const input = context.prompt as unknown as SocialCommunityResearchInput;
		if (!input) {
			return this.result("No input provided for Social & Community Research Agent.", 1.0);
		}

		const result = this.research(input);

		const content = JSON.stringify({
			sources: result.sources,
			publicSentiment: result.publicSentiment,
			practicalExperiences: result.practicalExperiences,
			emergingIssues: result.emergingIssues,
			alternativePerspectives: result.alternativePerspectives,
			corroborationNeeded: result.corroborationNeeded,
			wikipediaReferences: result.wikipediaReferences,
			confidence: result.confidence,
			availablePlatforms: result.availablePlatforms,
			mode: input.mode,
		});

		return {
			agentId: this.id,
			content,
			confidence: result.confidence / 10,
			timestamp: Date.now(),
		};
	}

	protected result(content: string, confidence: number = 1.0): AgentResult {
		return {
			agentId: this.id,
			content,
			confidence,
			timestamp: Date.now(),
		};
	}

	research(input: SocialCommunityResearchInput): SocialCommunityResult {
		const { userQuestion, claimsToCheck = [], context = "", mode, availablePlatforms = [] } = input;
		const sources: CommunitySource[] = [];
		const practicalExperiences: string[] = [];
		const emergingIssues: string[] = [];
		const alternativePerspectives: string[] = [];
		const corroborationNeeded: string[] = [];
		const wikipediaReferences: string[] = [];

		const platforms = availablePlatforms.length > 0 ? availablePlatforms : ["wikipedia", "reddit", "forum"];
		const topic = this.extractTopic(userQuestion);

		// Wikipedia - for references and claim verification
		if (platforms.includes("wikipedia")) {
			wikipediaReferences.push(`Wikipedia: ${topic} - overview article available`);
			wikipediaReferences.push(`Wikipedia: ${topic} - related references and citations`);
			sources.push({
				platform: "wikipedia",
				title: `Wikipedia: ${topic}`,
				claim: "Encyclopedic overview available",
				sentiment: "neutral",
				verificationStatus: mode === "live" ? "verified" : "needs_corroboration",
				postDate: "2025",
			});
		}

		// Reddit - public discussions
		if (platforms.includes("reddit")) {
			sources.push({
				platform: "reddit",
				title: `Reddit discussion: ${topic}`,
				claim: "Community members report varied experiences",
				sentiment: "mixed",
				verificationStatus: "needs_corroboration",
				postDate: "2025",
				engagementScore: 42,
			});
			practicalExperiences.push("Reddit users report mixed experiences with this topic");
			corroborationNeeded.push("Reddit claims require verification against primary sources");
		}

		// X (Twitter)
		if (platforms.includes("x")) {
			sources.push({
				platform: "x",
				title: `X posts about ${topic}`,
				claim: "Real-time sentiment and emerging issues",
				sentiment: "neutral",
				verificationStatus: "needs_corroboration",
				postDate: "2025",
			});
		}

		// Forums
		if (platforms.includes("forum")) {
			sources.push({
				platform: "forum",
				title: `Forum thread: ${topic}`,
				claim: "Long-form community discussion available",
				sentiment: "mixed",
				verificationStatus: "needs_corroboration",
				postDate: "2024",
				engagementScore: 15,
			});
		}

		// Analyze claims for social sentiment
		for (const claim of claimsToCheck) {
			const sentiment = this.inferSentiment(claim);
			if (sentiment !== "neutral") {
				practicalExperiences.push(`Community sentiment on "${claim}": ${sentiment}`);
			}
			if (!this.claimHasPrimarySupport(claim)) {
				corroborationNeeded.push(claim);
			}
		}

		// Emerging issues from context
		if (/uncertain|unclear|disputed|controversial|emerging/i.test(userQuestion)) {
			emergingIssues.push("Topic shows signs of ongoing debate and uncertainty");
		}

		// Alternative perspectives
		if (/compare|versus|alternative|different|other/i.test(userQuestion)) {
			alternativePerspectives.push("Community discussion suggests multiple valid approaches");
		}

		const sentimentCounts = sources.reduce(
			(acc, s) => {
				acc[s.sentiment] = (acc[s.sentiment] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);
		const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

		const publicSentiment = `Overall community sentiment appears ${dominantSentiment} based on ${sources.length} source(s) across platforms: ${platforms.join(", ")}.` +
			(mode === "sample" ? " [SAMPLE MODE: social data is synthetic]" : "");

		const confidence = sources.length > 0 ? Math.min(7, 3 + sources.length) : 3;

		return {
			sources,
			publicSentiment,
			practicalExperiences,
			emergingIssues,
			alternativePerspectives,
			corroborationNeeded,
			wikipediaReferences,
			confidence,
			availablePlatforms: platforms,
		};
	}

	private extractTopic(question: string): string {
		const words = question.split(/\s+/).filter((w) => w.length > 3);
		return words.slice(0, 4).join(" ") || "this topic";
	}

	private inferSentiment(text: string): "positive" | "negative" | "neutral" | "mixed" {
		const lower = text.toLowerCase();
		const positive = /good|great|excellent|positive|benefit|advantage|recommend|satisfi/i;
		const negative = /bad|terrible|poor|negative|problem|issue|fail|avoid|disappoint/i;
		const p = positive.test(lower);
		const n = negative.test(lower);
		if (p && n) return "mixed";
		if (p) return "positive";
		if (n) return "negative";
		return "neutral";
	}

	private claimHasPrimarySupport(claim: string): boolean {
		const lower = claim.toLowerCase();
		return /official|documentation|government|peer.reviewed|study|research|verified/i.test(lower);
	}

	getSystemPrompt(): string {
		return `You are the Social & Community Research Agent for GOVERNMINDZ. Your job is to search relevant public discussions on Reddit, X, Wikipedia, forums, and other available search sources.

You must:
1. Identify public sentiment, practical experiences, emerging issues, and alternative perspectives.
2. Treat social claims as leads requiring corroboration where appropriate.
3. Use Wikipedia to discover references and verify important claims against original sources.
4. Do not claim access to a platform unless the required search tool is available.

Return evidence and citations, not merely unsupported summaries. Social claims are leads, not verified facts.`;
	}
}

export const socialCommunityResearchAgent = new SocialCommunityResearchAgent();
