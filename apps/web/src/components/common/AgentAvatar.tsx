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

	// Every seat and character resolves to its human-like 3D coworker avatar
	const renderCharacterSvg = () => {
		const person = getCartoonPerson(avatarId || humanName || seatId);
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
