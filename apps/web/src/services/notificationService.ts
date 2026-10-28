export type NotificationType =
	| "info"
	| "success"
	| "warning"
	| "error"
	| "run_complete"
	| "run_error"
	| "webhook_delivery"
	| "system";

export interface Notification {
	id: string;
	type: NotificationType;
	title: string;
	body?: string;
	timestamp: number;
	read: boolean;
	action?: {
		label: string;
		url?: string;
		onClick?: () => void;
	};
	source?: string;
	data?: Record<string, unknown>;
}

export interface NotificationPrefs {
	enabled: boolean;
	runComplete: boolean;
	runError: boolean;
	webhookDelivery: boolean;
	system: boolean;
	sound: boolean;
	desktop: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
	enabled: true,
	runComplete: true,
	runError: true,
	webhookDelivery: false,
	system: true,
	sound: true,
	desktop: false,
};

const STORAGE_KEY = "governmindz_notifications_v1";
const PREFS_KEY = "governmindz_notification_prefs_v1";
const MAX_NOTIFICATIONS = 200;

export class NotificationService {
	private notifications: Notification[] = [];
	private listeners: Array<(n: Notification[]) => void> = [];
	private prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };

	constructor() {
		this.load();
	}

	private load(): void {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					this.notifications = parsed.slice(-MAX_NOTIFICATIONS);
				}
			}
		} catch {
			// ignore
		}
		try {
			const rawPrefs = localStorage.getItem(PREFS_KEY);
			if (rawPrefs) {
				this.prefs = { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(rawPrefs) };
			}
		} catch {
			// ignore
		}
	}

	private persist(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notifications.slice(-MAX_NOTIFICATIONS)));
		} catch {
			// ignore
		}
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
		} catch {
			// ignore
		}
	}

	private emit(): void {
		const next = [...this.notifications];
		this.listeners.forEach((fn) => fn(next));
	}

	subscribe(fn: (notifications: Notification[]) => void): () => void {
		this.listeners.push(fn);
		fn([...this.notifications]);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== fn);
		};
	}

	getAll(): Notification[] {
		return [...this.notifications];
	}

	getUnreadCount(): number {
		return this.notifications.filter((n) => !n.read).length;
	}

	getPrefs(): NotificationPrefs {
		return { ...this.prefs };
	}

	shouldNotify(type: NotificationType): boolean {
		if (!this.prefs.enabled) return false;
		switch (type) {
			case "run_complete":
				return this.prefs.runComplete;
			case "run_error":
				return this.prefs.runError;
			case "webhook_delivery":
				return this.prefs.webhookDelivery;
			case "system":
				return this.prefs.system;
			default:
				return true;
		}
	}

	add(notification: Omit<Notification, "id" | "timestamp" | "read">): Notification {
		const n: Notification = {
			...notification,
			id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			timestamp: Date.now(),
			read: false,
		};
		this.notifications.unshift(n);
		this.notifications = this.notifications.slice(0, MAX_NOTIFICATIONS);
		this.persist();
		this.emit();
		return n;
	}

	markRead(id: string): void {
		const idx = this.notifications.findIndex((n) => n.id === id);
		if (idx !== -1) {
			this.notifications[idx].read = true;
			this.persist();
			this.emit();
		}
	}

	markAllRead(): void {
		let changed = false;
		for (const n of this.notifications) {
			if (!n.read) {
				n.read = true;
				changed = true;
			}
		}
		if (changed) {
			this.persist();
			this.emit();
		}
	}

	clear(): void {
		this.notifications = [];
		this.persist();
		this.emit();
	}

	delete(id: string): void {
		this.notifications = this.notifications.filter((n) => n.id !== id);
		this.persist();
		this.emit();
	}

	updatePrefs(next: Partial<NotificationPrefs>): void {
		this.prefs = { ...this.prefs, ...next };
		this.persist();
	}
}

export const notificationService = new NotificationService();
