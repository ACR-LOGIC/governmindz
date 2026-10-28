import React, { useState, useEffect } from "react";
import { KeyRound, ShieldCheck, Eye, EyeOff, Save, X, Server, Database, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { fetchConfigStatus, saveConfig, type ConfigStatusResponse } from "../../services/api";

interface LiveConfigModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfigSaved?: () => void;
}

export const LiveConfigModal: React.FC<LiveConfigModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
	const [status, setStatus] = useState<ConfigStatusResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

	// Form values
	const [meterlessHost, setMeterlessHost] = useState("");
	const [meterlessApiKey, setMeterlessApiKey] = useState("");
	const [meterlessModel, setMeterlessModel] = useState("nemotron-3.5-lightning-30b-a3b");

	const [zetarisHost, setZetarisHost] = useState("");
	const [zetarisPort, setZetarisPort] = useState("443");
	const [zetarisUser, setZetarisUser] = useState("");
	const [zetarisPassword, setZetarisPassword] = useState("");
	const [zetarisApiKey, setZetarisApiKey] = useState("");
	const [zetarisDatabase, setZetarisDatabase] = useState("");

	const [auditSecret, setAuditSecret] = useState("");

	// Visibility toggles
	const [showMeterlessKey, setShowMeterlessKey] = useState(false);
	const [showZetarisPass, setShowZetarisPass] = useState(false);
	const [showZetarisApiKey, setShowZetarisApiKey] = useState(false);
	const [showAuditSecret, setShowAuditSecret] = useState(false);

	useEffect(() => {
		if (isOpen) {
			loadStatus();
		}
	}, [isOpen]);

	const loadStatus = async () => {
		try {
			setLoading(true);
			const st = await fetchConfigStatus();
			setStatus(st);
			if (st.meterlessModel) setMeterlessModel(st.meterlessModel);
			if (st.zetarisPort) setZetarisPort(st.zetarisPort);
			if (st.zetarisDatabase) setZetarisDatabase(st.zetarisDatabase);
		} catch (e) {
			console.warn("Failed to load config status:", e);
		} finally {
			setLoading(false);
		}
	};

	if (!isOpen) return null;

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			setSaving(true);
			setFeedback(null);

			const payload: Record<string, string> = {};
			if (meterlessHost.trim()) payload.meterlessHost = meterlessHost.trim();
			if (meterlessApiKey.trim()) payload.meterlessApiKey = meterlessApiKey.trim();
			if (meterlessModel.trim()) payload.meterlessModel = meterlessModel.trim();

			if (zetarisHost.trim()) payload.zetarisHost = zetarisHost.trim();
			if (zetarisPort.trim()) payload.zetarisPort = zetarisPort.trim();
			if (zetarisUser.trim()) payload.zetarisUser = zetarisUser.trim();
			if (zetarisPassword.trim()) payload.zetarisPassword = zetarisPassword.trim();
			if (zetarisApiKey.trim()) payload.zetarisApiKey = zetarisApiKey.trim();
			if (zetarisDatabase.trim()) payload.zetarisDatabase = zetarisDatabase.trim();

			if (auditSecret.trim()) payload.auditSecret = auditSecret.trim();

			await saveConfig(payload);
			setFeedback({
				type: "success",
				msg: "Configuration saved securely and encrypted at rest with AES-256-GCM.",
			});
			await loadStatus();
			if (onConfigSaved) onConfigSaved();
		} catch (err: any) {
			setFeedback({
				type: "error",
				msg: err.message || "Failed to save configuration",
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-[24px] animate-fadeIn">
			<div id="tour-credentials-modal" className="max-w-2xl w-full bg-[#0c1122]/90 border border-[#212d4d]/80 rounded-2xl shadow-2xl p-6 text-slate-100 relative space-y-5 animate-scaleIn max-h-[90vh] flex flex-col glass-panel">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-[#1b2542] pb-3 shrink-0">
					<div className="flex items-center gap-2.5">
						<div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
							<ShieldCheck className="w-5 h-5" />
						</div>
						<div>
							<h3 className="text-base font-bold text-white flex items-center gap-1.5">
								Live Mode Credential Configuration
							</h3>
							<p className="text-xs text-slate-400">
								Encrypted at rest using AES-256-GCM in local master vault & .env.local
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#1a233d] transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Feedback Banner */}
				{feedback && (
					<div
						className={`text-xs p-3 rounded-xl border flex items-center gap-2 ${
							feedback.type === "success"
								? "bg-teal-950/40 border-teal-500/50 text-teal-300"
								: "bg-red-950/40 border-red-500/50 text-red-300"
						}`}
					>
						{feedback.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-400" />}
						<span>{feedback.msg}</span>
					</div>
				)}

				{/* Scrollable Form Body */}
				<form onSubmit={handleSave} className="space-y-5 overflow-y-auto pr-1 flex-1">
					{/* Status Overview Cards */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
						<div className="bg-[#121930] border border-[#1e2a48] rounded-xl p-3 space-y-1">
							<span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Meterless AI</span>
							<div className="flex items-center gap-1.5 font-bold">
								<span
									className={`w-2 h-2 rounded-full ${
										status?.meterlessConfigured ? "bg-teal-400" : "bg-amber-400"
									}`}
								/>
								<span className={status?.meterlessConfigured ? "text-teal-300" : "text-amber-300"}>
									{status?.meterlessConfigured ? "Configured" : "Not Set"}
								</span>
							</div>
							<div className="text-[11px] text-slate-400 truncate">
								{status?.meterlessHost || "Using local fallback"}
							</div>
						</div>

						<div className="bg-[#121930] border border-[#1e2a48] rounded-xl p-3 space-y-1">
							<span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Zetaris Lightning</span>
							<div className="flex items-center gap-1.5 font-bold">
								<span
									className={`w-2 h-2 rounded-full ${
										status?.zetarisConfigured ? "bg-teal-400" : "bg-amber-400"
									}`}
								/>
								<span className={status?.zetarisConfigured ? "text-teal-300" : "text-amber-300"}>
									{status?.zetarisConfigured ? "Configured" : "Not Set"}
								</span>
							</div>
							<div className="text-[11px] text-slate-400 truncate">
								{status?.zetarisHost || "Using sample data"}
							</div>
						</div>

						<div className="bg-[#121930] border border-[#1e2a48] rounded-xl p-3 space-y-1">
							<span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Audit Secret</span>
							<div className="flex items-center gap-1.5 font-bold">
								<span
									className={`w-2 h-2 rounded-full ${
										status?.auditSecretConfigured ? "bg-teal-400" : "bg-amber-400"
									}`}
								/>
								<span className={status?.auditSecretConfigured ? "text-teal-300" : "text-amber-300"}>
									{status?.auditSecretConfigured ? "Configured" : "Test Secret"}
								</span>
							</div>
							<div className="text-[11px] text-slate-400">HMAC-SHA256 Signing</div>
						</div>
					</div>

					{/* Meterless AI Section */}
					<div className="bg-[#11172a] border border-[#1e2842] rounded-xl p-4 space-y-3">
						<div className="flex items-center gap-2 text-xs font-bold text-teal-300">
							<Server className="w-4 h-4 text-teal-400" />
							<span>Meterless AI Runtime</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">Base URL / Endpoint</label>
								<input
									type="text"
									value={meterlessHost}
									onChange={(e) => setMeterlessHost(e.target.value)}
									placeholder={status?.meterlessHost || "http://127.0.0.1:8088/v1"}
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
								/>
							</div>
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">Model Identifier</label>
								<input
									type="text"
									value={meterlessModel}
									onChange={(e) => setMeterlessModel(e.target.value)}
									placeholder="nemotron-3.5-lightning-30b-a3b"
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
								/>
							</div>
							<div className="sm:col-span-2">
								<label className="block text-[11px] text-slate-400 mb-1">API Key / Token</label>
								<div className="relative">
									<input
										type={showMeterlessKey ? "text" : "password"}
										value={meterlessApiKey}
										onChange={(e) => setMeterlessApiKey(e.target.value)}
										placeholder={status?.hasMeterlessKey ? "•••••••••••• (Leave blank to keep current)" : "sk-..."}
										className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg pl-3 pr-10 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
									/>
									<button
										type="button"
										onClick={() => setShowMeterlessKey(!showMeterlessKey)}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
									>
										{showMeterlessKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
									</button>
								</div>
							</div>
						</div>
					</div>

					{/* Zetaris Lightning Section */}
					<div className="bg-[#11172a] border border-[#1e2842] rounded-xl p-4 space-y-3">
						<div className="flex items-center gap-2 text-xs font-bold text-amber-300">
							<Database className="w-4 h-4 text-amber-400" />
							<span>Zetaris Lightning Federated Data Engine</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
							<div className="sm:col-span-2">
								<label className="block text-[11px] text-slate-400 mb-1">Zetaris Host / Domain</label>
								<input
									type="text"
									value={zetarisHost}
									onChange={(e) => setZetarisHost(e.target.value)}
									placeholder={status?.zetarisHost || "sql.lightning.zetaris.io"}
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
								/>
							</div>
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">Port</label>
								<input
									type="text"
									value={zetarisPort}
									onChange={(e) => setZetarisPort(e.target.value)}
									placeholder="443"
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
								/>
							</div>
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">Database / Schema</label>
								<input
									type="text"
									value={zetarisDatabase}
									onChange={(e) => setZetarisDatabase(e.target.value)}
									placeholder="LIGHTNING_DB"
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
								/>
							</div>
							<div className="sm:col-span-3">
								<label className="block text-[11px] text-slate-400 mb-1">REST API Key / Token</label>
								<div className="relative">
									<input
										type={showZetarisApiKey ? "text" : "password"}
										value={zetarisApiKey}
										onChange={(e) => setZetarisApiKey(e.target.value)}
										placeholder={status?.hasZetarisApiKey ? "•••••••••••• (Leave blank to keep current)" : "Zetaris API key or auth token"}
										className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg pl-3 pr-10 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
									/>
									<button
										type="button"
										onClick={() => setShowZetarisApiKey(!showZetarisApiKey)}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
										aria-label={showZetarisApiKey ? "Hide Zetaris API key" : "Show Zetaris API key"}
									>
										{showZetarisApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
									</button>
								</div>
								<p className="text-[10px] text-slate-500 mt-1">
									Used as the Bearer token for read-only Zetaris REST queries. This is the
									credential the live query path needs.
								</p>
							</div>
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">Username</label>
								<input
									type="text"
									value={zetarisUser}
									onChange={(e) => setZetarisUser(e.target.value)}
									placeholder={status?.zetarisUser || "admin"}
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
								/>
							</div>
							<div>
								<label className="block text-[11px] text-slate-400 mb-1">JDBC Password (optional)</label>
								<div className="relative">
									<input
										type={showZetarisPass ? "text" : "password"}
										value={zetarisPassword}
										onChange={(e) => setZetarisPassword(e.target.value)}
										placeholder={status?.hasZetarisPassword ? "•••••••••••• (Keep current)" : "Optional JDBC password"}
										className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg pl-3 pr-10 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
									/>
									<button
										type="button"
										onClick={() => setShowZetarisPass(!showZetarisPass)}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
										aria-label={showZetarisPass ? "Hide Zetaris JDBC password" : "Show Zetaris JDBC password"}
									>
										{showZetarisPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
									</button>
								</div>
							</div>
						</div>
					</div>

					{/* Cryptographic Audit Secret */}
					<div className="bg-[#11172a] border border-[#1e2842] rounded-xl p-4 space-y-3">
						<div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
							<Lock className="w-4 h-4 text-indigo-400" />
							<span>Cryptographic Audit Trail HMAC Secret</span>
						</div>
						<div className="text-xs">
							<label className="block text-[11px] text-slate-400 mb-1">AUDIT_TRAIL_SECRET</label>
							<div className="relative">
								<input
									type={showAuditSecret ? "text" : "password"}
									value={auditSecret}
									onChange={(e) => setAuditSecret(e.target.value)}
									placeholder={status?.auditSecretConfigured ? "•••••••••••• (Leave blank to keep current)" : "Secret key..."}
									className="w-full bg-[#0c101e] border border-[#1e2842] rounded-lg pl-3 pr-10 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
								/>
								<button
									type="button"
									onClick={() => setShowAuditSecret(!showAuditSecret)}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
								>
									{showAuditSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
								</button>
							</div>
						</div>
					</div>

					{/* Footer save button */}
					<div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1b2542] shrink-0">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-[#161f36] transition-colors"
						>
							Close
						</button>
						<button
							type="submit"
							disabled={saving}
							className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 rounded-xl bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-300 hover:to-teal-400 shadow-md shadow-teal-950/40 active:scale-95 transition-all disabled:opacity-50"
						>
							{saving ? <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> : <Save className="w-4 h-4" />}
							<span>Save & Encrypt Credentials</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};
