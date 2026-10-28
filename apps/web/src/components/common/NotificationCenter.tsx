import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
	Bell,
	CheckCircle2,
	AlertCircle,
	ShieldAlert,
	Info,
	X,
	RotateCcw,
	Trash2,
	Play,
	Clock,
	Link,
	Check,
} from "lucide-react";
import type { Notification, NotificationType } from "../../services/notificationService";
import { notificationService } from "../../services/notificationService";

const TYPE_ICONS: Record<NotificationType, React.ElementType> = {
	info: Info,
	success: CheckCircle2,
	warning: AlertCircle,
	error: ShieldAlert,
	run_complete: Play,
	run_error: ShieldAlert,
	webhook_delivery: Link,
	system: Clock,
};

const TYPE_LABELS: Record<NotificationType, string> = {
	info: "Info",
	success: "Success",
	warning: "Warning",
	error: "Error",
	run_complete: "Run Complete",
	run_error: "Run Error",
	webhook_delivery: "Webhook Delivery",
	system: "System",
};

const TYPE_COLORS: Record<NotificationType, string> = {
	info: "#5eead4",
	success: "#34d399",
	warning: "#fbbf24",
	error: "#fb7185",
	run_complete: "#34d399",
	run_error: "#fb7185",
	webhook_delivery: "#818cf8",
	system: "#c4b5fd",
};

interface NotificationCenterProps {
	isOpen: boolean;
	onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);

	const formatRelative = (ts: number) => {
		const now = Date.now();
		const diff = now - ts;
		if (diff < 60000) return "Just now";
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
	};

	const handleMarkRead = useCallback((id: string) => {
		notificationService.markRead(id);
	}, []);

	const handleMarkAllRead = useCallback(() => {
		notificationService.markAllRead();
	}, []);

	const handleDismiss = useCallback((id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		notificationService.delete(id);
	}, []);

	const handleClearAll = useCallback(() => {
		notificationService.clear();
	}, []);

	const handleToggleDesktop = useCallback(() => {
		const next = !notificationService.getPrefs().desktop;
		notificationService.updatePrefs({ desktop: next });
		if (next && Notification.permission === "default") {
			Notification.requestPermission();
		}
	}, []);

	useEffect(() => {
		const unsub = notificationService.subscribe((list) => {
			setNotifications(list);
			setUnreadCount(list.filter((n) => !n.read).length);
		});
		return unsub;
	}, []);

	const hasUnread = unreadCount > 0;

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-end justify-end p-4 pointer-events-none">
			<div className="pointer-events-auto w-full max-w-md glass-panel rounded-2xl shadow-2xl border border-[#1e2842]/80 overflow-hidden flex flex-col">
				{/* Header */}
				<div className="px-5 py-4 border-b border-[#1e2842]/50 bg-[#0c101e]/40 backdrop-blur-md flex items-center justify-between shrink-0">
					<div className="flex items-center gap-2">
						<div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
							<Bell className="w-5 h-5" />
						</div>
						<div>
							<h3 className="font-display font-bold text-base text-slate-100">Notifications</h3>
							<p className="text-[10px] text-slate-400">
								{unreadCount} unread
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{hasUnread && (
							<button
								type="button"
								onClick={handleMarkAllRead}
								className="text-[10px] font-mono text-teal-400 hover:text-teal-300 transition-colors"
							>
								Mark all read
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161f36] transition-colors"
							aria-label="Close notifications"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Desktop permission banner */}
				{typeof Notification !== "undefined" && Notification.permission === "default" && (
					<div className="px-4 py-2 border-b border-[#1e2842]/30 bg-[#0f1424]/20">
						<button
							type="button"
							onClick={handleToggleDesktop}
							className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-950/10 border border-teal-900/30 text-teal-300 text-xs font-semibold transition-colors hover:bg-teal-950/20"
						>
							<Play className="w-3.5 h-3.5 shrink-0" />
							<span>Enable desktop notifications</span>
						</button>
					</div>
				)}

				{/* List */}
				<div className="flex-1 overflow-y-auto pr-1">
					{notifications.length === 0 ? (
						<div className="p-8 text-center text-slate-400">
							<Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
							<p className="text-xs font-medium">No notifications yet</p>
							<p className="text-[11px] text-slate-500 mt-1">
								Activity alerts will appear here when deliberations complete, errors occur,
								or webhooks deliver.
							</p>
						</div>
					) : (
						<div className="space-y-1">
							{notifications.map((n) => {
								const Icon = TYPE_ICONS[n.type] || Info;
								const colorClass = TYPE_COLORS[n.type];
								return (
									<div
										key={n.id}
										onClick={() => handleMarkRead(n.id)}
										className={`group cursor-pointer px-4 py-3.5 border-b border-[#1e2842]/30 transition-all hover:bg-[#12182b]/40 ${
											n.read ? "opacity-70" : "border-l-2 border-l-amber-500 bg-amber-950/5"
										}`}
									>
										<div className="flex items-center justify-between gap-3">
											<div className="flex items-center gap-2.5 min-w-0">
												<div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[#0a0e1a] border border-[#262630]">
													<Icon className="w-3.5 h-3.5" style={{ color: colorClass }} />
												</div>
												<div className="min-w-0">
													<div className="flex items-center gap-1.5">
														<span className="text-xs font-bold text-slate-200 truncate">
															{GROUP_LABEL(n.type)}
														</span>
														<span className="text-[9px] font-mono text-slate-500">
															{formatRelative(n.timestamp)}
														</span>
													</div>
													<div className="text-sm text-slate-100 font-medium leading-snug truncate">
														{n.title}
													</div>
													{n.body && (
														<div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
															{n.body}
														</div>
													)}
												</div>
											</div>
											<div className="flex items-center gap-1 shrink-0">
												{!n.read && (
													<span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
												)}
												<button
													type="button"
													onClick={(e) => handleDismiss(n.id, e)}
													className="p-1 text-slate-500 hover:text-rose-400 hover:bg-[#161f36] rounded transition-colors"
													aria-label="Dismiss notification"
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										</div>
										{n.action && (
											<div className="mt-2 pt-2 border-t border-[#1e2842]/20">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														if (n.action?.url) {
															window.open(n.action.url, "_blank");
														}
														if (n.action?.onClick) n.action.onClick();
														handleMarkRead(n.id);
													}}
													className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono text-teal-400 bg-teal-950/10 border border-teal-900/30 hover:bg-teal-950/20 transition-colors"
												>
													<Link className="w-3 h-3 shrink-0" />
													<span>{n.action.label}</span>
												</button>
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-4 py-3 border-t border-[#1e2842]/30 bg-[#0c101e]/20 flex items-center justify-between shrink-0">
					<button
						type="button"
						onClick={handleClearAll}
						className="text-[10px] font-mono text-rose-400 hover:text-rose-300 transition-colors"
						disabled={notifications.length === 0}
					>
						<Trash2 className="w-3 h-3 shrink-0 mr-1" />
						Clear all
					</button>
					<div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
						<span>{notifications.length}</span>
						<span>total</span>
					</div>
				</div>
			</div>
		</div>,
		document.body
	);
};

function GROUP_LABEL(type: NotificationType): string {
	return TYPE_LABELS[type];
}
