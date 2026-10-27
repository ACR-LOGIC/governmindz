import type { DebateResult } from "@governmindz/core/debate/DebateLoop";

export function collectDissentSources(transcript: DebateResult["transcript"]): string[] {
	const sources = new Set<string>();
	for (const message of transcript) {
		for (const source of [
			...(message.structured?.dissents_from || []),
			...(message.structured?.dissentsFrom || []),
		]) {
			if (source) sources.add(source);
		}
	}
	return [...sources].sort();
}
