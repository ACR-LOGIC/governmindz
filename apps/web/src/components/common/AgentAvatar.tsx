import React, { useId } from "react";
import type { AgentStatus } from "../../types";
import { getCartoonPerson } from "../../services/cartoonPeople";

interface AgentAvatarProps {
	seatId?: string;
	avatarId?: string;
	humanName?: string;
	size?: "xs" | "sm" | "md" | "lg" | "xl";
	className?: string;
	showStatusPip?: boolean;
	status?: AgentStatus;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
	seatId = "FactChecker",
	avatarId,
	humanName,
	size = "md",
	className = "",
	showStatusPip = false,
	status,
}) => {
	const rawId = useId();
	const safeId = rawId.replace(/[^a-zA-Z0-9]/g, "_");

	const sizeMap = {
		xs: "w-6 h-6",
		sm: "w-8 h-8",
		md: "w-10 h-10",
		lg: "w-12 h-12",
		xl: "w-16 h-16",
	};

	const pipSizeMap = {
		xs: "w-1.5 h-1.5 ring-1",
		sm: "w-2 h-2 ring-1.5",
		md: "w-2.5 h-2.5 ring-2",
		lg: "w-3 h-3 ring-2",
		xl: "w-3.5 h-3.5 ring-2",
	};

	const getStatusColor = (s?: string) => {
		switch (s) {
			case "analyzing":
				return "bg-amber-400 animate-pulse";
			case "challenging":
				return "bg-rose-500 animate-bounce";
			case "completed":
				return "bg-emerald-400";
			case "failed":
			case "error":
				return "bg-red-500";
			case "queued":
				return "bg-sky-400";
			default:
				return "bg-slate-500";
		}
	};

	// Render character SVG based on assigned cartoon person or agent role
	const renderCharacterSvg = () => {
		if (avatarId || humanName) {
			const person = getCartoonPerson(avatarId || humanName);
			const gradId = `cgrad_${safeId}_${person.id}`;
			return (
				<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<linearGradient id={gradId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
							<stop stopColor={person.bgGradient[0]} />
							<stop offset="1" stopColor={person.bgGradient[1]} />
						</linearGradient>
					</defs>
					<circle cx="32" cy="32" r="30" fill={`url(#${gradId})`} />
					{person.svgContent(gradId)}
				</svg>
			);
		}

		switch (seatId) {
			case "FactChecker":
				// Forensic Detective Owl: Magnifying glass, detective hat, inquisitive eye
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background Circle */}
						<circle cx="32" cy="32" r="30" fill="url(#fc-grad)" />
						{/* Owl/Detective Body */}
						<ellipse cx="32" cy="42" rx="18" ry="16" fill="#1e3a8a" />
						<ellipse cx="32" cy="43" rx="13" ry="12" fill="#3b82f6" opacity="0.3" />
						{/* Detective Coat Lapels */}
						<path d="M24 38 L32 48 L40 38" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
						{/* Face */}
						<circle cx="32" cy="28" r="14" fill="#38bdf8" />
						{/* Eyes with Glasses */}
						<circle cx="27" cy="27" r="5.5" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />
						<circle cx="37" cy="27" r="5.5" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />
						{/* Glasses Bridge */}
						<path d="M32.5 27 L31.5 27" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
						{/* Inquisitive Pupils */}
						<circle cx="28" cy="27" r="2.5" fill="#0f172a" />
						<circle cx="38" cy="27" r="2.5" fill="#0f172a" />
						<circle cx="29" cy="26" r="1" fill="#ffffff" />
						<circle cx="39" cy="26" r="1" fill="#ffffff" />
						{/* Owl Beak */}
						<polygon points="32,29 30,33 34,33" fill="#f59e0b" />
						{/* Detective Deerstalker Hat */}
						<path d="M18 20 C18 12 46 12 46 20 Z" fill="#0369a1" />
						<path d="M14 20 Q32 17 50 20" stroke="#7dd3fc" strokeWidth="2.5" strokeLinecap="round" />
						<path d="M30 12 L34 12 L33 10 L31 10 Z" fill="#f59e0b" />
						{/* Magnifying Glass held up */}
						<circle cx="44" cy="36" r="6" stroke="#fbbf24" strokeWidth="2" fill="#e0f2fe" fillOpacity="0.6" />
						<line x1="48" y1="40" x2="55" y2="47" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" />
						<defs>
							<linearGradient id="fc-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#0284c7" />
								<stop offset="1" stopColor="#0c1e4d" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "CloudArchitect":
				// Safety Beaver / Construction Racoon with Hard Hat & Blueprint
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#ca-grad)" />
						{/* Body */}
						<ellipse cx="32" cy="44" rx="18" ry="15" fill="#064e3b" />
						{/* Safety Vest */}
						<path d="M22 36 L27 54 L37 54 L42 36" fill="#10b981" />
						<rect x="25" y="42" width="14" height="3" fill="#ecfdf5" rx="1" />
						{/* Head */}
						<circle cx="32" cy="28" r="13" fill="#a7f3d0" />
						{/* Determined Eyes */}
						<circle cx="28" cy="27" r="3.5" fill="#ffffff" />
						<circle cx="36" cy="27" r="3.5" fill="#ffffff" />
						<circle cx="29" cy="27" r="2" fill="#064e3b" />
						<circle cx="37" cy="27" r="2" fill="#064e3b" />
						<circle cx="30" cy="26" r="0.8" fill="#ffffff" />
						<circle cx="38" cy="26" r="0.8" fill="#ffffff" />
						{/* Confident Smirk & Snout */}
						<ellipse cx="32" cy="32" rx="4" ry="2.5" fill="#047857" />
						<polygon points="32,30.5 30.5,32 33.5,32" fill="#064e3b" />
						{/* Yellow Hard Hat */}
						<path d="M19 22 C19 13 45 13 45 22 Z" fill="#facc15" />
						<ellipse cx="32" cy="22" rx="15" ry="3" fill="#eab308" />
						<rect x="30" y="14" width="4" height="7" fill="#ca8a04" rx="1" />
						{/* Rolled Blueprint */}
						<rect x="42" y="34" width="6" height="18" rx="2" fill="#38bdf8" transform="rotate(-25 42 34)" />
						<line x1="43" y1="36" x2="47" y2="35" stroke="#ffffff" strokeWidth="1" />
						<defs>
							<linearGradient id="ca-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#059669" />
								<stop offset="1" stopColor="#022c22" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "Synthesizer":
				// Wise Judicial Capybara / Arbiter with Wig and Gavel
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#sy-grad)" />
						{/* Judicial Robe */}
						<ellipse cx="32" cy="44" rx="19" ry="15" fill="#2e1065" />
						{/* White Judge's Collar */}
						<polygon points="32,36 27,45 37,45" fill="#f5f3ff" />
						<line x1="32" y1="36" x2="32" y2="45" stroke="#7c3aed" strokeWidth="1" />
						{/* Head */}
						<ellipse cx="32" cy="28" rx="12" ry="11" fill="#e9d5ff" />
						{/* Zen Calm Eyes */}
						<path d="M26 27 Q29 24 30 27" stroke="#581c87" strokeWidth="2" strokeLinecap="round" fill="none" />
						<path d="M34 27 Q35 24 38 27" stroke="#581c87" strokeWidth="2" strokeLinecap="round" fill="none" />
						{/* Cute Capybara Snout & Little Smile */}
						<ellipse cx="32" cy="32" rx="3.5" ry="2.5" fill="#c084fc" />
						<circle cx="31" cy="32" r="0.8" fill="#581c87" />
						<circle cx="33" cy="32" r="0.8" fill="#581c87" />
						{/* Judicial Wig (rolls of white curls) */}
						<ellipse cx="32" cy="18" rx="13" ry="5" fill="#ffffff" />
						<circle cx="20" cy="22" r="4.5" fill="#f3e8ff" />
						<circle cx="44" cy="22" r="4.5" fill="#f3e8ff" />
						<circle cx="19" cy="28" r="4" fill="#e9d5ff" />
						<circle cx="45" cy="28" r="4" fill="#e9d5ff" />
						{/* Gavel in Corner */}
						<rect x="42" y="38" width="5" height="12" rx="1" fill="#b45309" transform="rotate(35 42 38)" />
						<rect x="44" y="34" width="10" height="6" rx="2" fill="#78350f" transform="rotate(35 44 34)" />
						<defs>
							<linearGradient id="sy-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#7c3aed" />
								<stop offset="1" stopColor="#1e0b4b" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "RivalChallenger":
				// Feisty Boxing Badger with Boxing Gloves & Headband
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#rc-grad)" />
						{/* Torso */}
						<ellipse cx="32" cy="45" rx="17" ry="14" fill="#4c0519" />
						{/* Head */}
						<circle cx="32" cy="28" r="13" fill="#fecdd3" />
						{/* Badger Stripes */}
						<path d="M26 18 Q27 28 25 34" stroke="#881337" strokeWidth="3" strokeLinecap="round" />
						<path d="M38 18 Q37 28 39 34" stroke="#881337" strokeWidth="3" strokeLinecap="round" />
						{/* Feisty Eyes & Brow */}
						<line x1="25" y1="23" x2="29" y2="25" stroke="#881337" strokeWidth="2" strokeLinecap="round" />
						<line x1="39" y1="23" x2="35" y2="25" stroke="#881337" strokeWidth="2" strokeLinecap="round" />
						<circle cx="27" cy="27" r="2.5" fill="#881337" />
						<circle cx="37" cy="27" r="2.5" fill="#881337" />
						<circle cx="28" cy="26" r="0.8" fill="#ffffff" />
						<circle cx="38" cy="26" r="0.8" fill="#ffffff" />
						{/* Band-Aid on Cheek */}
						<rect x="37" y="31" width="5" height="2.5" rx="1" fill="#fbcfe8" transform="rotate(20 37 31)" />
						{/* Red Sweatband */}
						<path d="M19 22 Q32 19 45 22" stroke="#e11d48" strokeWidth="4" strokeLinecap="round" />
						{/* Red Boxing Gloves raised! */}
						<circle cx="18" cy="39" r="6.5" fill="#e11d48" stroke="#9f1239" strokeWidth="1" />
						<circle cx="46" cy="39" r="6.5" fill="#e11d48" stroke="#9f1239" strokeWidth="1" />
						<ellipse cx="19" cy="36" rx="2" ry="1" fill="#f43f5e" />
						<ellipse cx="45" cy="36" rx="2" ry="1" fill="#f43f5e" />
						<defs>
							<linearGradient id="rc-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#e11d48" />
								<stop offset="1" stopColor="#350414" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "Thinker":
				// Cosmic Philosopher Octopus with wire glasses and teacup
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#tk-grad)" />
						{/* Head (Bulbous Octopus/Squid Head) */}
						<path d="M22 30 C19 14 45 14 42 30 C45 35 44 42 41 44 C38 46 36 38 32 38 C28 38 26 46 23 44 C20 42 19 35 22 30 Z" fill="#fbbf24" />
						{/* Round Wire Glasses */}
						<circle cx="27" cy="27" r="4.5" fill="#ffffff" stroke="#78350f" strokeWidth="1.5" />
						<circle cx="37" cy="27" r="4.5" fill="#ffffff" stroke="#78350f" strokeWidth="1.5" />
						<line x1="31.5" y1="27" x2="32.5" y2="27" stroke="#78350f" strokeWidth="1.5" />
						{/* Dreamy Curious Eyes */}
						<circle cx="28" cy="26" r="2" fill="#78350f" />
						<circle cx="38" cy="26" r="2" fill="#78350f" />
						<circle cx="29" cy="25" r="0.8" fill="#ffffff" />
						<circle cx="39" cy="25" r="0.8" fill="#ffffff" />
						{/* Pondering Tentacle on Chin */}
						<path d="M23 40 Q28 42 32 37" stroke="#d97706" strokeWidth="3" strokeLinecap="round" fill="none" />
						{/* Teacup in other Tentacle */}
						<rect x="42" y="38" width="8" height="6" rx="2" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
						<path d="M50 40 C52 40 52 43 50 43" stroke="#b45309" strokeWidth="1" fill="none" />
						<path d="M44 35 Q45 33 44 31" stroke="#fef08a" strokeWidth="1" strokeLinecap="round" />
						<path d="M47 35 Q48 33 47 31" stroke="#fef08a" strokeWidth="1" strokeLinecap="round" />
						<defs>
							<linearGradient id="tk-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#f59e0b" />
								<stop offset="1" stopColor="#451a03" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "Orchestrator":
				// Flight Director Commander with Cybernetic Headset & Comm Mic
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#gm-grad)" />
						{/* Commander Uniform */}
						<ellipse cx="32" cy="45" rx="18" ry="14" fill="#18181b" />
						<path d="M26 38 L32 46 L38 38" stroke="#f4b942" strokeWidth="2" strokeLinecap="round" />
						{/* Head */}
						<circle cx="32" cy="28" r="13" fill="#fef08a" />
						{/* Cybernetic Visor / Glasses */}
						<rect x="22" y="24" width="20" height="7" rx="3.5" fill="#f4b942" stroke="#78350f" strokeWidth="1" />
						<line x1="24" y1="27.5" x2="40" y2="27.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
						{/* Smile */}
						<path d="M28 34 Q32 37 36 34" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
						{/* Mission Headset & Boom Mic */}
						<path d="M19 28 C19 16 45 16 45 28" stroke="#3f3f46" strokeWidth="3" strokeLinecap="round" fill="none" />
						<circle cx="19" cy="28" r="3.5" fill="#71717a" />
						<circle cx="45" cy="28" r="3.5" fill="#71717a" />
						<path d="M45 28 L40 35 L35 35" stroke="#3f3f46" strokeWidth="2" strokeLinecap="round" fill="none" />
						<circle cx="34" cy="35" r="1.5" fill="#22c55e" />
						<defs>
							<linearGradient id="gm-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#f4b942" />
								<stop offset="1" stopColor="#3f2702" />
							</linearGradient>
						</defs>
					</svg>
				);

			case "user":
			case "Operator":
				// Cyberpunk Operator / Human with Glowing Visor & Coffee Mug
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						{/* Background */}
						<circle cx="32" cy="32" r="30" fill="url(#op-grad)" />
						{/* Hoodie / Cyber Jacket */}
						<ellipse cx="32" cy="46" rx="18" ry="14" fill="#334155" />
						<path d="M24 38 L32 48 L40 38" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
						{/* Head */}
						<circle cx="32" cy="28" r="13" fill="#f8fafc" />
						{/* Dark Hair / Beanie */}
						<path d="M20 25 C20 16 44 16 44 25 Z" fill="#0f172a" />
						{/* Holographic Shades */}
						<rect x="23" y="25" width="18" height="6" rx="2" fill="#0284c7" />
						<line x1="25" y1="28" x2="39" y2="28" stroke="#7dd3fc" strokeWidth="1.5" />
						{/* Chill Smirk */}
						<path d="M29 34 Q32 36 35 34" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" fill="none" />
						{/* Coffee Mug */}
						<rect x="42" y="38" width="7" height="9" rx="2" fill="#f8fafc" stroke="#64748b" strokeWidth="1" />
						<path d="M49 41 C51 41 51 45 49 45" stroke="#64748b" strokeWidth="1" fill="none" />
						<line x1="45" y1="36" x2="45" y2="34" stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" />
						<defs>
							<linearGradient id="op-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
								<stop stopColor="#64748b" />
								<stop offset="1" stopColor="#0f172a" />
							</linearGradient>
						</defs>
					</svg>
				);

			default:
				// Generic Smart AI Bot
				return (
					<svg viewBox="0 0 64 64" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
						<circle cx="32" cy="32" r="30" fill="#1e293b" />
						<rect x="22" y="22" width="20" height="20" rx="6" fill="#38bdf8" />
						<circle cx="28" cy="30" r="2.5" fill="#0f172a" />
						<circle cx="36" cy="30" r="2.5" fill="#0f172a" />
						<rect x="28" y="36" width="8" height="2" rx="1" fill="#0f172a" />
						<line x1="32" y1="22" x2="32" y2="16" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
						<circle cx="32" cy="14" r="2" fill="#f4b942" />
					</svg>
				);
		}
	};

	return (
		<div className={`relative shrink-0 rounded-2xl overflow-hidden shadow-lg transition-transform hover:scale-105 ${sizeMap[size]} ${className}`}>
			{renderCharacterSvg()}

			{/* Status Indicator Pip */}
			{showStatusPip && (
				<span
					className={`absolute bottom-0 right-0 rounded-full ring-[#0c101e] ${pipSizeMap[size]} ${getStatusColor(
						status,
					)}`}
				/>
			)}
		</div>
	);
};
