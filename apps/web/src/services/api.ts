import type { HealthStatus, ScenarioItem, Conversation } from "../types";

const BASE_URL = "";

export async function fetchHealth(): Promise<HealthStatus> {
	const res = await fetch(`${BASE_URL}/api/health`);
	if (!res.ok) throw new Error("Health check failed");
	return res.json();
}

export async function fetchScenarios(): Promise<ScenarioItem[]> {
	const res = await fetch(`${BASE_URL}/api/scenarios`);
	if (!res.ok) throw new Error("Failed to load scenarios");
	return res.json();
}

export async function fetchConversations(): Promise<Conversation[]> {
	try {
		const res = await fetch(`${BASE_URL}/api/conversations`);
		if (res.ok) {
			return await res.json();
		}
	} catch (e) {
		console.warn("Server conversation listing fallback:", e);
	}
	return [];
}

export async function fetchConversation(id: string): Promise<Conversation | null> {
	try {
		const res = await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(id)}`);
		if (res.ok) {
			return await res.json();
		}
	} catch (e) {
		console.warn("Failed to fetch conversation from server:", e);
	}
	return null;
}

export async function saveConversation(conv: Conversation): Promise<void> {
	try {
		await fetch(`${BASE_URL}/api/conversations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(conv),
		});
	} catch (e) {
		console.warn("Failed to save conversation to server:", e);
	}
}

export async function renameConversation(id: string, title: string): Promise<void> {
	try {
		await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(id)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title }),
		});
	} catch (e) {
		console.warn("Failed to rename conversation on server:", e);
	}
}

export async function deleteConversation(id: string): Promise<void> {
	try {
		await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
	} catch (e) {
		console.warn("Failed to delete conversation from server:", e);
	}
}

export interface StartRunParams {
	mode: "sample" | "live";
	scenario?: string;
	topic?: string;
	conversationId?: string;
}

export async function startRun(params: StartRunParams): Promise<{ runId: string }> {
	const res = await fetch(`${BASE_URL}/api/run`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: "Run request failed" }));
		throw new Error(err.error || `HTTP ${res.status}`);
	}
	return res.json();
}

export function subscribeRunEvents(
	runId: string,
	onEvent: (event: Record<string, unknown>) => void,
	onError: (err: Event) => void,
	onDone: () => void,
): () => void {
	const evtSource = new EventSource(`${BASE_URL}/api/run/${encodeURIComponent(runId)}/events`);

	evtSource.onmessage = (e) => {
		try {
			const parsed = JSON.parse(e.data);
			onEvent(parsed);
		} catch (err) {
			console.error("Failed to parse SSE event payload:", err);
		}
	};

	evtSource.onerror = (e) => {
		onError(e);
		evtSource.close();
		onDone();
	};

	return () => {
		evtSource.close();
	};
}
