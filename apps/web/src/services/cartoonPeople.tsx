import React from "react";

export interface CartoonPerson {
	id: string;
	name: string;
	tagline: string;
	bgGradient: [string, string];
	skin: string;
	hair: string;
	clothes: string;
	accent: string;
	svgContent: (idPrefix: string) => React.ReactNode;
}

export const CARTOON_PEOPLE: Record<string, CartoonPerson> = {
	vicky: {
		id: "vicky",
		name: "Vicky",
		tagline: "Vibrant Audio & Data Sleuth",
		bgGradient: ["#8b5cf6", "#4c1d95"],
		skin: "#fcd34d",
		hair: "#c084fc",
		clothes: "#065f46",
		accent: "#a7f3d0",
		svgContent: (p) => (
			<g id={p}>
				{/* Torso / Jacket */}
				<path d="M16 60 C16 48 48 48 48 60 Z" fill="#065f46" />
				<path d="M26 48 L32 58 L38 48" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
				{/* Head & Neck */}
				<rect x="29" y="38" width="6" height="8" rx="2" fill="#f59e0b" />
				<circle cx="32" cy="30" r="13" fill="#fbbf24" />
				{/* Purple Hair */}
				<path d="M19 28 C19 16 45 16 45 28 C45 32 43 36 41 37 C41 26 39 20 32 20 C25 20 23 26 23 37 C21 36 19 32 19 28 Z" fill="#c084fc" />
				{/* Cute face */}
				<circle cx="27" cy="30" r="2" fill="#1e1b4b" />
				<circle cx="37" cy="30" r="2" fill="#1e1b4b" />
				<circle cx="28" cy="29" r="0.75" fill="#ffffff" />
				<circle cx="38" cy="29" r="0.75" fill="#ffffff" />
				<path d="M29 35 Q32 38 35 35" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Headphones over ears */}
				<path d="M17 30 C17 18 47 18 47 30" stroke="#a855f7" strokeWidth="3" strokeLinecap="round" fill="none" />
				<rect x="15" y="26" width="4" height="9" rx="2" fill="#e9d5ff" stroke="#9333ea" strokeWidth="1" />
				<rect x="45" y="26" width="4" height="9" rx="2" fill="#e9d5ff" stroke="#9333ea" strokeWidth="1" />
			</g>
		),
	},
	arturo: {
		id: "arturo",
		name: "Arturo",
		tagline: "Pragmatic Architecture Lead",
		bgGradient: ["#0284c7", "#0f172a"],
		skin: "#fbcfe8",
		hair: "#1e293b",
		clothes: "#1e3a8a",
		accent: "#60a5fa",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#1e3a8a" />
				<path d="M32 48 L32 60" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="2 2" />
				<rect x="29" y="38" width="6" height="8" rx="2" fill="#f472b6" />
				<circle cx="32" cy="29" r="13" fill="#fbcfe8" />
				{/* Styled dark slick hair */}
				<path d="M19 26 C19 15 45 14 45 23 C45 25 41 22 36 21 C29 20 22 23 20 26 Z" fill="#0f172a" />
				{/* Glasses */}
				<rect x="23" y="27" width="7" height="5" rx="1.5" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
				<rect x="34" y="27" width="7" height="5" rx="1.5" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
				<line x1="30" y1="29.5" x2="34" y2="29.5" stroke="#38bdf8" strokeWidth="1.5" />
				<circle cx="26.5" cy="29.5" r="1.5" fill="#0f172a" />
				<circle cx="37.5" cy="29.5" r="1.5" fill="#0f172a" />
				<path d="M29 36 Q32 38 35 36" stroke="#831843" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	luis: {
		id: "luis",
		name: "Luis",
		tagline: "Enthusiastic System Explorer",
		bgGradient: ["#f59e0b", "#78350f"],
		skin: "#fed7aa",
		hair: "#451a03",
		clothes: "#b45309",
		accent: "#38bdf8",
		svgContent: (p) => (
			<g id={p}>
				<path d="M16 60 C16 48 48 48 48 60 Z" fill="#b45309" />
				<circle cx="32" cy="30" r="13" fill="#fed7aa" />
				{/* Backwards baseball cap */}
				<path d="M18 25 C18 15 46 15 46 25 Z" fill="#0284c7" />
				<path d="M20 26 Q32 23 44 26" stroke="#38bdf8" strokeWidth="2" fill="none" />
				{/* Cap backward visor */}
				<path d="M38 23 C44 22 49 20 53 22 C49 25 43 25 39 25 Z" fill="#0369a1" />
				{/* Eyes & cheeky smile */}
				<circle cx="27" cy="31" r="2" fill="#1c1917" />
				<circle cx="37" cy="31" r="2" fill="#1c1917" />
				<circle cx="28" cy="30" r="0.75" fill="#ffffff" />
				<circle cx="38" cy="30" r="0.75" fill="#ffffff" />
				<path d="M28 35 Q32 40 36 35" fill="#78350f" stroke="#78350f" strokeWidth="1" />
			</g>
		),
	},
	shaniqua: {
		id: "shaniqua",
		name: "Shaniqua",
		tagline: "Executive Governance Synthesizer",
		bgGradient: ["#10b981", "#064e3b"],
		skin: "#b45309",
		hair: "#171717",
		clothes: "#047857",
		accent: "#facc15",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#047857" />
				<circle cx="32" cy="32" r="12" fill="#b45309" />
				{/* High Braided Afro Bun */}
				<circle cx="32" cy="16" r="10" fill="#171717" />
				<circle cx="32" cy="16" r="8" fill="#262626" />
				<path d="M20 28 C20 18 44 18 44 28 C44 23 40 21 32 21 C24 21 20 23 20 28 Z" fill="#171717" />
				{/* Gold Hoop Earrings */}
				<circle cx="19" cy="34" r="3" stroke="#facc15" strokeWidth="1.5" fill="none" />
				<circle cx="45" cy="34" r="3" stroke="#facc15" strokeWidth="1.5" fill="none" />
				{/* Eyes & Smile */}
				<circle cx="27" cy="32" r="2" fill="#171717" />
				<circle cx="37" cy="32" r="2" fill="#171717" />
				<circle cx="28" cy="31" r="0.75" fill="#ffffff" />
				<circle cx="38" cy="31" r="0.75" fill="#ffffff" />
				<path d="M29 37 Q32 40 35 37" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	rj: {
		id: "rj",
		name: "RJ",
		tagline: "Cyberpunk Challenger & Verification Lead",
		bgGradient: ["#f43f5e", "#881337"],
		skin: "#fed7aa",
		hair: "#0f172a",
		clothes: "#1e1b4b",
		accent: "#06b6d4",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#1e1b4b" />
				<path d="M28 48 L32 55 L36 48" fill="#e11d48" />
				<circle cx="32" cy="30" r="12.5" fill="#fed7aa" />
				{/* Spiky Hair */}
				<polygon points="20,24 23,16 27,22 32,13 37,22 41,16 44,24" fill="#0f172a" />
				{/* Neon Visor / Goggles */}
				<path d="M21 26 L43 26 L41 33 L23 33 Z" fill="#06b6d4" fillOpacity="0.85" stroke="#22d3ee" strokeWidth="1.5" />
				<line x1="24" y1="29.5" x2="40" y2="29.5" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 2" />
				<path d="M28 37 Q32 39 36 37" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	lucy: {
		id: "lucy",
		name: "Lucy",
		tagline: "Curious Evidence Detective",
		bgGradient: ["#ec4899", "#831843"],
		skin: "#fde047",
		hair: "#b45309",
		clothes: "#d97706",
		accent: "#f472b6",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#d97706" />
				<circle cx="32" cy="30" r="12" fill="#fef08a" />
				{/* Curly Hair Buns */}
				<circle cx="21" cy="22" r="6" fill="#b45309" />
				<circle cx="43" cy="22" r="6" fill="#b45309" />
				<circle cx="32" cy="18" r="7" fill="#b45309" />
				{/* Round glasses */}
				<circle cx="26.5" cy="30" r="4.5" stroke="#ec4899" strokeWidth="1.5" fill="none" />
				<circle cx="37.5" cy="30" r="4.5" stroke="#ec4899" strokeWidth="1.5" fill="none" />
				<line x1="31" y1="30" x2="33" y2="30" stroke="#ec4899" strokeWidth="1.5" />
				<circle cx="26.5" cy="30" r="1.5" fill="#1c1917" />
				<circle cx="37.5" cy="30" r="1.5" fill="#1c1917" />
				<path d="M29 36 Q32 39 35 36" stroke="#a16207" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	tom: {
		id: "tom",
		name: "Tom",
		tagline: "Coffee-Fueled Consensus Builder",
		bgGradient: ["#14b8a6", "#0f766e"],
		skin: "#fed7aa",
		hair: "#78350f",
		clothes: "#1e293b",
		accent: "#fbbf24",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#1e293b" />
				<circle cx="32" cy="28" r="12" fill="#fed7aa" />
				{/* Hair and Beard */}
				<path d="M20 25 C20 15 44 15 44 25 C41 19 23 19 20 25 Z" fill="#78350f" />
				<path d="M24 33 C24 43 40 43 40 33 L38 32 C38 38 26 38 26 32 Z" fill="#78350f" />
				<circle cx="27" cy="28" r="1.8" fill="#1e293b" />
				<circle cx="37" cy="28" r="1.8" fill="#1e293b" />
				<path d="M29 35 Q32 37 35 35" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	jovita: {
		id: "jovita",
		name: "Jovita",
		tagline: "Policy Compliance Specialist",
		bgGradient: ["#6366f1", "#312e81"],
		skin: "#fde047",
		hair: "#18181b",
		clothes: "#312e81",
		accent: "#a5b4fc",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#312e81" />
				<circle cx="32" cy="30" r="12" fill="#fde047" />
				{/* High Ponytail */}
				<circle cx="43" cy="20" r="5" fill="#18181b" />
				<path d="M20 27 C20 16 44 16 44 27 Z" fill="#18181b" />
				<circle cx="27" cy="30" r="2" fill="#18181b" />
				<circle cx="37" cy="30" r="2" fill="#18181b" />
				<path d="M29 36 Q32 39 35 36" stroke="#854d0e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Security Badge */}
				<rect x="29" y="52" width="6" height="7" rx="1" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1" />
			</g>
		),
	},
	elvia: {
		id: "elvia",
		name: "Elvia",
		tagline: "Harmonizer & Provenance Tracker",
		bgGradient: ["#fb7185", "#9f1239"],
		skin: "#fed7aa",
		hair: "#581c87",
		clothes: "#e11d48",
		accent: "#f43f5e",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#e11d48" />
				<path d="M22 47 C22 43 42 43 42 47 L44 54 C44 58 20 58 20 54 Z" fill="#fb923c" />
				<circle cx="32" cy="29" r="12" fill="#fed7aa" />
				{/* Soft Wavy Hair */}
				<path d="M19 28 C19 15 45 15 45 28 C48 37 44 42 40 40 C43 32 41 22 32 20 C23 22 21 32 24 40 C20 42 16 37 19 28 Z" fill="#581c87" />
				<circle cx="27" cy="29" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="29" r="1.8" fill="#1c1917" />
				<path d="M29 35 Q32 38 35 35" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	raul: {
		id: "raul",
		name: "Raul",
		tagline: "Auditor & Retention Investigator",
		bgGradient: ["#10b981", "#064e3b"],
		skin: "#fcd34d",
		hair: "#1c1917",
		clothes: "#064e3b",
		accent: "#34d399",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#064e3b" />
				<polygon points="32,47 29,56 32,60 35,56" fill="#fbbf24" />
				<circle cx="32" cy="28" r="12" fill="#fcd34d" />
				<path d="M20 24 C20 15 44 15 44 24 Z" fill="#1c1917" />
				<circle cx="27" cy="27" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="27" r="1.8" fill="#1c1917" />
				{/* Mustache */}
				<path d="M27 34 Q32 32 37 34 Q32 37 27 34 Z" fill="#1c1917" />
			</g>
		),
	},
	alex: {
		id: "alex",
		name: "Alejandro aka Alex",
		tagline: "Fast Pipeline Strategist",
		bgGradient: ["#3b82f6", "#1d4ed8"],
		skin: "#fed7aa",
		hair: "#171717",
		clothes: "#0284c7",
		accent: "#f59e0b",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#0284c7" />
				<circle cx="32" cy="30" r="12" fill="#fed7aa" />
				<path d="M19 25 C19 15 45 15 45 25 Z" fill="#171717" />
				{/* Sunglasses perched on hair */}
				<rect x="23" y="17" width="8" height="5" rx="1" fill="#0f172a" />
				<rect x="33" y="17" width="8" height="5" rx="1" fill="#0f172a" />
				<line x1="31" y1="19" x2="33" y2="19" stroke="#94a3b8" strokeWidth="1.5" />
				<circle cx="27" cy="31" r="2" fill="#171717" />
				<circle cx="37" cy="31" r="2" fill="#171717" />
				<path d="M28 36 Q32 40 36 36" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	meche: {
		id: "meche",
		name: "Meche",
		tagline: "Analytical Proof Reviewer",
		bgGradient: ["#06b6d4", "#0e7490"],
		skin: "#fde047",
		hair: "#09090b",
		clothes: "#0891b2",
		accent: "#67e8f9",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#0891b2" />
				<circle cx="32" cy="29" r="12" fill="#fde047" />
				{/* Sleek bob cut */}
				<path d="M18 29 C18 16 46 16 46 29 C46 36 43 38 43 38 L43 27 L21 27 L21 38 C21 38 18 36 18 29 Z" fill="#09090b" />
				{/* Cat-eye glasses */}
				<path d="M22 28 Q27 25 31 29 Q27 32 22 28 Z" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
				<path d="M42 28 Q37 25 33 29 Q37 32 42 28 Z" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
				<circle cx="26.5" cy="28.5" r="1.5" fill="#09090b" />
				<circle cx="37.5" cy="28.5" r="1.5" fill="#09090b" />
				<path d="M29 36 Q32 38 35 36" stroke="#854d0e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	emely: {
		id: "emely",
		name: "Emely",
		tagline: "Live Ops Dispatcher",
		bgGradient: ["#84cc16", "#3f6212"],
		skin: "#fed7aa",
		hair: "#ca8a04",
		clothes: "#4d7c0f",
		accent: "#bef264",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#4d7c0f" />
				<circle cx="32" cy="30" r="12" fill="#fed7aa" />
				{/* High ponytail & headset */}
				<circle cx="44" cy="18" r="6" fill="#ca8a04" />
				<path d="M19 27 C19 16 45 16 45 27 Z" fill="#ca8a04" />
				{/* Headset boom with mic */}
				<path d="M18 30 C18 20 46 20 46 30" stroke="#374151" strokeWidth="2" fill="none" />
				<path d="M19 32 L25 37" stroke="#374151" strokeWidth="2" strokeLinecap="round" />
				<circle cx="26" cy="38" r="2" fill="#ef4444" />
				<circle cx="27" cy="30" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="30" r="1.8" fill="#1c1917" />
				<path d="M29 36 Q32 39 35 36" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	val: {
		id: "val",
		name: "Val",
		tagline: "Security Gateway Architect",
		bgGradient: ["#14b8a6", "#115e59"],
		skin: "#fcd34d",
		hair: "#374151",
		clothes: "#0f766e",
		accent: "#2dd4bf",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#0f766e" />
				<circle cx="32" cy="31" r="12" fill="#fcd34d" />
				{/* Slouchy Beanie Hat */}
				<path d="M18 26 C18 14 46 14 46 26 Z" fill="#14b8a6" />
				<rect x="17" y="24" width="30" height="4" rx="2" fill="#0d9488" />
				<circle cx="27" cy="31" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="31" r="1.8" fill="#1c1917" />
				<path d="M29 37 Q32 40 35 37" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	leah: {
		id: "leah",
		name: "Leah",
		tagline: "Cryptographic Evidence Specialist",
		bgGradient: ["#a855f7", "#6b21a8"],
		skin: "#fde047",
		hair: "#1e1b4b",
		clothes: "#581c87",
		accent: "#d8b4fe",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#581c87" />
				<circle cx="32" cy="29" r="12" fill="#fde047" />
				{/* Straight hair with bangs */}
				<path d="M19 28 C19 16 45 16 45 28 L45 37 L41 37 L41 24 L23 24 L23 37 L19 37 Z" fill="#1e1b4b" />
				<circle cx="27" cy="29" r="2" fill="#1e1b4b" />
				<circle cx="37" cy="29" r="2" fill="#1e1b4b" />
				<path d="M29 35 Q32 38 35 35" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	abby: {
		id: "abby",
		name: "Abby",
		tagline: "Data Scientist & Fact Checker",
		bgGradient: ["#0284c7", "#075985"],
		skin: "#fed7aa",
		hair: "#b91c1c",
		clothes: "#0369a1",
		accent: "#7dd3fc",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#0369a1" />
				<circle cx="32" cy="30" r="12" fill="#fed7aa" />
				{/* Auburn Hair */}
				<path d="M19 27 C19 16 45 16 45 27 Z" fill="#b91c1c" />
				{/* Science Goggles on Forehead */}
				<rect x="22" y="18" width="9" height="5" rx="1.5" stroke="#38bdf8" strokeWidth="1.5" fill="#e0f2fe" fillOpacity="0.8" />
				<rect x="33" y="18" width="9" height="5" rx="1.5" stroke="#38bdf8" strokeWidth="1.5" fill="#e0f2fe" fillOpacity="0.8" />
				<line x1="31" y1="20.5" x2="33" y2="20.5" stroke="#38bdf8" strokeWidth="1.5" />
				<circle cx="27" cy="30" r="2" fill="#1c1917" />
				<circle cx="37" cy="30" r="2" fill="#1c1917" />
				<path d="M28 36 Q32 40 36 36" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
};

/**
 * Get cartoon person by name or ID, or return a deterministic default
 */
export function getCartoonPerson(nameOrId?: string): CartoonPerson {
	if (!nameOrId) return CARTOON_PEOPLE.arturo;

	const normalized = nameOrId.toLowerCase().trim();
	if (CARTOON_PEOPLE[normalized]) {
		return CARTOON_PEOPLE[normalized];
	}

	// Try finding by name matching
	const found = Object.values(CARTOON_PEOPLE).find(
		(p) => p.name.toLowerCase() === normalized || p.id === normalized,
	);
	if (found) return found;

	// Deterministic fallback based on string hash
	const keys = Object.keys(CARTOON_PEOPLE);
	let hash = 0;
	for (let i = 0; i < nameOrId.length; i++) {
		hash = (hash << 5) - hash + nameOrId.charCodeAt(i);
		hash |= 0;
	}
	const idx = Math.abs(hash) % keys.length;
	return CARTOON_PEOPLE[keys[idx]];
}
