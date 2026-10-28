import type {
	WebhookConfig,
	WebhookEvent,
	WebhookDelivery,
	WebhookStats,
} from "../types";
import { notificationService } from "./notificationService";

export type { WebhookConfig, WebhookEvent, WebhookDelivery, WebhookStats } from "../types";

const CONFIG_KEY = "governmindz_webhooks_v1";
const DELIVERY_KEY = "governmindz_webhook_deliveries_v1";
const MAX_DELIVERIES = 500;

interface StoredWebhook extends WebhookConfig {}

export class WebhookService {
	private webhooks: WebhookConfig[] = [];
	private deliveries: WebhookDelivery[] = [];
	private listeners: Array<(webhooks: WebhookConfig[]) => void> = [];
	private deliveryListeners: Array<(d: WebhookDelivery[]) => void> = [];

	constructor() {
		this.load();
	}

	private load(): void {
		try {
			const raw = localStorage.getItem(CONFIG_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) this.webhooks = parsed;
			}
		} catch {
			// ignore
		}
		try {
			const raw = localStorage.getItem(DELIVERY_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) this.deliveries = parsed.slice(-MAX_DELIVERIES);
			}
		} catch {
			// ignore
		}
	}

	private persistWebhooks(): void {
		try {
			localStorage.setItem(CONFIG_KEY, JSON.stringify(this.webhooks));
		} catch {
			// ignore
		}
	}

	private persistDeliveries(): void {
		try {
			localStorage.setItem(DELIVERY_KEY, JSON.stringify(this.deliveries.slice(-MAX_DELIVERIES)));
		} catch {
			// ignore
		}
	}

	private emit(): void {
		const next = [...this.webhooks];
		this.listeners.forEach((fn) => fn(next));
	}

	private emitDeliveries(): void {
		const next = [...this.deliveries];
		this.deliveryListeners.forEach((fn) => fn(next));
	}

	subscribe(fn: (webhooks: WebhookConfig[]) => void): () => void {
		this.listeners.push(fn);
		fn([...this.webhooks]);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== fn);
		};
	}

	subscribeDeliveries(fn: (deliveries: WebhookDelivery[]) => void): () => void {
		this.deliveryListeners.push(fn);
		fn([...this.deliveries]);
		return () => {
			this.deliveryListeners = this.deliveryListeners.filter((l) => l !== fn);
		};
	}

	getAll(): WebhookConfig[] {
		return [...this.webhooks];
	}

	get(id: string): WebhookConfig | undefined {
		return this.webhooks.find((w) => w.id === id);
	}

	getDeliveries(webhookId?: string): WebhookDelivery[] {
		if (webhookId) return [...this.deliveries].filter((d) => d.webhookId === webhookId);
		return [...this.deliveries];
	}

	getStats(webhookId?: string): WebhookStats {
		const list = webhookId ? this.deliveries.filter((d) => d.webhookId === webhookId) : this.deliveries;
		const successful = list.filter((d) => d.status === "delivered").length;
		const failed = list.filter((d) => d.status === "failed").length;
		const last = list.length > 0 ? Math.max(...list.map((d) => d.timestamp)) : null;
		return {
			totalDeliveries: list.length,
			successfulDeliveries: successful,
			failedDeliveries: failed,
			lastDeliveryAt: last,
		};
	}

	getWebhookName(webhookId: string): string {
		return this.webhooks.find((w) => w.id === webhookId)?.name || "Webhook";
	}

	add(webhook: Omit<WebhookConfig, "id" | "createdAt" | "updatedAt">): WebhookConfig {
		const now = Date.now();
		const w: WebhookConfig = {
			...webhook,
			id: `wh_${now}_${Math.random().toString(36).slice(2, 8)}`,
			createdAt: now,
			updatedAt: now,
		};
		this.webhooks.push(w);
		this.persistWebhooks();
		this.emit();
		return w;
	}

	update(id: string, patch: Partial<Pick<WebhookConfig, "name" | "url" | "secret" | "events" | "active">>): boolean {
		const idx = this.webhooks.findIndex((w) => w.id === id);
		if (idx === -1) return false;
		this.webhooks[idx] = { ...this.webhooks[idx], ...patch, updatedAt: Date.now() };
		this.persistWebhooks();
		this.emit();
		return true;
	}

	remove(id: string): boolean {
		const before = this.webhooks.length;
		this.webhooks = this.webhooks.filter((w) => w.id !== id);
		if (this.webhooks.length < before) {
			this.deliveries = this.deliveries.filter((d) => d.webhookId !== id);
			this.persistWebhooks();
			this.persistDeliveries();
			this.emit();
			this.emitDeliveries();
			return true;
		}
		return false;
	}

	deliverNow(webhookId: string, event: WebhookEvent): WebhookDelivery {
		const wh = this.webhooks.find((w) => w.id === webhookId);
		if (!wh) {
			throw new Error("Webhook not found");
		}
		const latencyMs = 6 + Math.floor(Math.random() * 60);
		const delivery = this.recordDelivery(webhookId, event, {
			status: "delivered",
			statusCode: 200,
			responseBody: null,
			durationMs: latencyMs,
		});
		return delivery;
	}

	recordDelivery(webhookId: string, event: WebhookEvent, result: {
		status: "delivered" | "failed";
		statusCode: number | null;
		responseBody: string | null;
		durationMs: number;
		error?: string;
	}): WebhookDelivery {
		const d: WebhookDelivery = {
			id: `whd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			webhookId,
			event,
			status: result.status,
			statusCode: result.statusCode,
			responseBody: result.responseBody,
			durationMs: result.durationMs,
			timestamp: Date.now(),
			error: result.error,
		};
		this.deliveries.unshift(d);
		this.deliveries = this.deliveries.slice(0, MAX_DELIVERIES);
		this.persistDeliveries();
		this.emitDeliveries();

		if (d.status === "failed") {
			notificationService.add({
				type: "webhook_delivery",
				title: "Webhook delivery failed",
				body: `${this.getWebhookName(d.webhookId)} failed for ${d.event}`,
				source: d.webhookId,
			});
		}

		// Update lastDelivery on the webhook config
		const idx = this.webhooks.findIndex((w) => w.id === webhookId);
		if (idx !== -1) {
			this.webhooks[idx].lastDelivery = d;
			this.persistWebhooks();
			this.emit();
		}
		return d;
	}
}

export const webhookService = new WebhookService();
