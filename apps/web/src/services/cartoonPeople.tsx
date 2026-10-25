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
	priya: {
		id: "priya",
		name: "Priya",
		tagline: "Meticulous Fact Checker",
		bgGradient: ["#0284c7", "#0369a1"],
		skin: "#d97706",
		hair: "#18181b",
		clothes: "#0f766e",
		accent: "#38bdf8",
		svgContent: (p) => (
			<g id={p}>
				{/* 3D Lighting Filter / Gradients */}
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#f59e0b" />
						<stop offset="70%" stopColor="#d97706" />
						<stop offset="100%" stopColor="#b45309" />
					</radialGradient>
					<linearGradient id={`${p}_blazer`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="#14b8a6" />
						<stop offset="100%" stopColor="#0f766e" />
					</linearGradient>
				</defs>
				{/* Torso / Tailored Teal Blazer */}
				<path d="M14 60 C14 47 50 47 50 60 Z" fill={`url(#${p}_blazer)`} />
				<path d="M25 47 L32 58 L39 47" fill="#f8fafc" />
				<path d="M23 48 L32 60 L41 48" stroke="#0d9488" strokeWidth="1.5" fill="none" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#b45309" />
				{/* Head with 3D gradient */}
				<circle cx="32" cy="28" r="13" fill={`url(#${p}_face)`} />
				{/* Chic Low Bun Hair with delicate strand */}
				<circle cx="32" cy="15" r="5" fill="#18181b" />
				<path d="M19 26 C19 15 45 15 45 26 C44 21 38 18 32 18 C26 18 20 21 19 26 Z" fill="#18181b" />
				<path d="M18 25 C17 31 18 35 19 36" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Observant Eyes with Raised Eyebrow (Subtle Asymmetry) */}
				{/* Left eyebrow arched up inquisitively */}
				<path d="M23 21 Q27 18 30 22" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Right eyebrow neutral confident */}
				<path d="M34 22 Q37 21 41 23" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Stylish Tortoiseshell / Teal Frames */}
				<rect x="23" y="24" width="7" height="6" rx="2" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
				<rect x="34" y="24" width="7" height="6" rx="2" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
				<line x1="30" y1="27" x2="34" y2="27" stroke="#38bdf8" strokeWidth="1.5" />
				{/* Expressive Eyes with Highlights */}
				<circle cx="26.5" cy="27" r="1.8" fill="#18181b" />
				<circle cx="37.5" cy="27" r="1.8" fill="#18181b" />
				<circle cx="27.2" cy="26.3" r="0.7" fill="#ffffff" />
				<circle cx="38.2" cy="26.3" r="0.7" fill="#ffffff" />
				{/* Perceptive Smile / Smirk */}
				<path d="M29 35 Q32 38 36 34" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	vicky: {
		id: "vicky",
		name: "Vicky",
		tagline: "Forensic Data Sleuth & Fact Checker",
		bgGradient: ["#8b5cf6", "#4c1d95"],
		skin: "#fcd34d",
		hair: "#7c3aed",
		clothes: "#065f46",
		accent: "#a7f3d0",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#fef08a" />
						<stop offset="70%" stopColor="#fcd34d" />
						<stop offset="100%" stopColor="#f59e0b" />
					</radialGradient>
				</defs>
				{/* Torso / Smart Jacket */}
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#065f46" />
				<path d="M26 48 L32 58 L38 48" stroke="#34d399" strokeWidth="2" strokeLinecap="round" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#f59e0b" />
				{/* Head */}
				<circle cx="32" cy="29" r="13" fill={`url(#${p}_face)`} />
				{/* Styled Hair */}
				<path d="M19 28 C19 16 45 16 45 28 C45 32 43 36 41 37 C41 26 39 20 32 20 C25 20 23 26 23 37 C21 36 19 32 19 28 Z" fill="#7c3aed" />
				{/* Observant Eyes with Eyebrow */}
				<path d="M23 23 Q27 20 30 23" stroke="#4c1d95" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 23 Q37 21 41 23" stroke="#4c1d95" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<circle cx="27" cy="29" r="2" fill="#1e1b4b" />
				<circle cx="37" cy="29" r="2" fill="#1e1b4b" />
				<circle cx="28" cy="28" r="0.75" fill="#ffffff" />
				<circle cx="38" cy="28" r="0.75" fill="#ffffff" />
				<path d="M29 35 Q32 38 35 35" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Chic Tech Headset */}
				<path d="M17 29 C17 18 47 18 47 29" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" fill="none" />
				<rect x="15" y="25" width="4" height="8" rx="2" fill="#e9d5ff" stroke="#9333ea" strokeWidth="1" />
				<rect x="45" y="25" width="4" height="8" rx="2" fill="#e9d5ff" stroke="#9333ea" strokeWidth="1" />
			</g>
		),
	},
	arturo: {
		id: "arturo",
		name: "Arturo",
		tagline: "Confident Rival Challenger",
		bgGradient: ["#f43f5e", "#881337"],
		skin: "#fed7aa",
		hair: "#0f172a",
		clothes: "#1e1b4b",
		accent: "#fb7185",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#ffedd5" />
						<stop offset="70%" stopColor="#fed7aa" />
						<stop offset="100%" stopColor="#fdba74" />
					</radialGradient>
				</defs>
				{/* Torso / Dark Navy Workplace Jacket */}
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#1e1b4b" />
				<polygon points="26,48 32,56 38,48" fill="#e11d48" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#fb923c" />
				{/* Head */}
				<circle cx="32" cy="29" r="13" fill={`url(#${p}_face)`} />
				{/* Dark slick professional hairstyle */}
				<path d="M19 25 C19 14 45 13 45 22 C45 24 41 21 36 20 C29 19 22 22 20 25 Z" fill="#0f172a" />
				{/* Skeptical, Confident Brow & Direct Gaze */}
				<path d="M23 22 Q27 19 30 23" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 23 Q38 21 41 22" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Direct Gaze Eyes with Sharp Highlights */}
				<circle cx="27" cy="28" r="2" fill="#0f172a" />
				<circle cx="37" cy="28" r="2" fill="#0f172a" />
				<circle cx="27.8" cy="27.3" r="0.7" fill="#ffffff" />
				<circle cx="37.8" cy="27.3" r="0.7" fill="#ffffff" />
				{/* Confident Skeptical Smirk */}
				<path d="M28 35 Q32 37 36 34" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	kenji: {
		id: "kenji",
		name: "Kenji",
		tagline: "Reflective Thinker & Challenger",
		bgGradient: ["#f59e0b", "#78350f"],
		skin: "#fed7aa",
		hair: "#1c1917",
		clothes: "#262626",
		accent: "#fbbf24",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#ffedd5" />
						<stop offset="70%" stopColor="#fed7aa" />
						<stop offset="100%" stopColor="#f59e0b" />
					</radialGradient>
				</defs>
				{/* Torso / Ribbed Charcoal Turtleneck */}
				<path d="M15 60 C15 47 49 47 49 60 Z" fill="#262626" />
				<rect x="25" y="38" width="14" height="9" rx="3" fill="#1c1917" />
				{/* Head */}
				<circle cx="32" cy="28" r="13" fill={`url(#${p}_face)`} />
				{/* Stylish Textured Hair */}
				<path d="M18 24 C18 13 46 13 46 24 C44 19 38 17 32 17 C26 17 20 19 18 24 Z" fill="#1c1917" />
				<path d="M21 21 Q25 15 31 19" stroke="#1c1917" strokeWidth="2" strokeLinecap="round" />
				{/* Contemplative Eyebrows */}
				<path d="M23 21 Q27 20 30 22" stroke="#1c1917" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 22 Q37 20 41 21" stroke="#1c1917" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Stylish Circular Eyewear */}
				<circle cx="26.5" cy="26" r="4.2" stroke="#fbbf24" strokeWidth="1.2" fill="none" />
				<circle cx="37.5" cy="26" r="4.2" stroke="#fbbf24" strokeWidth="1.2" fill="none" />
				<line x1="30.7" y1="26" x2="33.3" y2="26" stroke="#fbbf24" strokeWidth="1.2" />
				{/* Thoughtful Eyes */}
				<circle cx="26.5" cy="26" r="1.6" fill="#1c1917" />
				<circle cx="37.5" cy="26" r="1.6" fill="#1c1917" />
				<circle cx="27" cy="25.4" r="0.6" fill="#ffffff" />
				<circle cx="38" cy="25.4" r="0.6" fill="#ffffff" />
				{/* Thoughtful Expression */}
				<path d="M29 34 Q32 36 35 34" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	marcus: {
		id: "marcus",
		name: "Marcus",
		tagline: "Composed Cloud Infrastructure Architect",
		bgGradient: ["#059669", "#064e3b"],
		skin: "#b45309",
		hair: "#171717",
		clothes: "#1e293b",
		accent: "#34d399",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#d97706" />
						<stop offset="70%" stopColor="#b45309" />
						<stop offset="100%" stopColor="#78350f" />
					</radialGradient>
				</defs>
				{/* Torso / Practical Modern Overshirt over Olive Shirt */}
				<path d="M14 60 C14 47 50 47 50 60 Z" fill="#1e293b" />
				<path d="M27 48 L32 58 L37 48" fill="#065f46" />
				<line x1="32" y1="48" x2="32" y2="60" stroke="#334155" strokeWidth="1.5" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#78350f" />
				{/* Head */}
				<circle cx="32" cy="29" r="13" fill={`url(#${p}_face)`} />
				{/* Neat textured buzz fade */}
				<path d="M19 26 C19 15 45 15 45 26 C43 21 38 19 32 19 C26 19 21 21 19 26 Z" fill="#171717" />
				{/* Composed, Thoughtful Eyebrows & Eyes */}
				<path d="M23 23 Q27 21 30 23" stroke="#171717" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 23 Q37 21 41 23" stroke="#171717" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<circle cx="27" cy="28" r="2" fill="#171717" />
				<circle cx="37" cy="28" r="2" fill="#171717" />
				<circle cx="27.8" cy="27.3" r="0.7" fill="#ffffff" />
				<circle cx="37.8" cy="27.3" r="0.7" fill="#ffffff" />
				{/* Well-groomed short beard / stubble */}
				<path d="M25 32 C25 39 39 39 39 32 L37 32 C37 36 27 36 27 32 Z" fill="#171717" opacity="0.85" />
				{/* Calm confident smile */}
				<path d="M29 35 Q32 37 35 35" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	sophia: {
		id: "sophia",
		name: "Sophia",
		tagline: "Composed Cloud Security Architect",
		bgGradient: ["#10b981", "#047857"],
		skin: "#fcd34d",
		hair: "#451a03",
		clothes: "#065f46",
		accent: "#6ee7b7",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#fef08a" />
						<stop offset="70%" stopColor="#fcd34d" />
						<stop offset="100%" stopColor="#f59e0b" />
					</radialGradient>
				</defs>
				{/* Torso / Emerald Knit Sweater */}
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#065f46" />
				<path d="M27 48 Q32 52 37 48" stroke="#34d399" strokeWidth="1.5" fill="none" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#f59e0b" />
				{/* Head */}
				<circle cx="32" cy="29" r="13" fill={`url(#${p}_face)`} />
				{/* Sleek Dark Chestnut Bob */}
				<path d="M18 28 C18 15 46 15 46 28 C46 35 43 37 43 37 L43 26 L21 26 L21 37 C21 37 18 35 18 28 Z" fill="#451a03" />
				{/* Composed, Thoughtful Expression */}
				<path d="M23 22 Q27 20 30 22" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 22 Q37 20 41 22" stroke="#451a03" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<circle cx="27" cy="27.5" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="27.5" r="1.8" fill="#1c1917" />
				<circle cx="27.8" cy="26.8" r="0.7" fill="#ffffff" />
				<circle cx="37.8" cy="26.8" r="0.7" fill="#ffffff" />
				<path d="M29 35 Q32 37 35 35" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	luis: {
		id: "luis",
		name: "Luis",
		tagline: "Enthusiastic Cloud Architect",
		bgGradient: ["#f59e0b", "#78350f"],
		skin: "#fed7aa",
		hair: "#451a03",
		clothes: "#b45309",
		accent: "#38bdf8",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#b45309" />
				<path d="M26 48 L32 58 L38 48" fill="#0284c7" />
				<circle cx="32" cy="29" r="13" fill="#fed7aa" />
				{/* Modern haircut */}
				<path d="M18 24 C18 14 46 14 46 24 C43 19 23 19 18 24 Z" fill="#451a03" />
				<circle cx="27" cy="28" r="2" fill="#1c1917" />
				<circle cx="37" cy="28" r="2" fill="#1c1917" />
				<circle cx="27.8" cy="27.2" r="0.75" fill="#ffffff" />
				<circle cx="37.8" cy="27.2" r="0.75" fill="#ffffff" />
				<path d="M28 35 Q32 38 36 35" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	val: {
		id: "val",
		name: "Val",
		tagline: "Approachable Consensus Synthesizer",
		bgGradient: ["#8b5cf6", "#5b21b6"],
		skin: "#fde047",
		hair: "#374151",
		clothes: "#4c1d95",
		accent: "#c4b5fd",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#fef08a" />
						<stop offset="70%" stopColor="#fde047" />
						<stop offset="100%" stopColor="#eab308" />
					</radialGradient>
				</defs>
				{/* Torso / Plum Tailored Cardigan */}
				<path d="M14 60 C14 47 50 47 50 60 Z" fill="#4c1d95" />
				<path d="M26 48 L32 58 L38 48" fill="#e9d5ff" />
				{/* Subtle gold chain */}
				<circle cx="32" cy="51" r="1.5" fill="#facc15" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#ca8a04" />
				{/* Head */}
				<circle cx="32" cy="29" r="13" fill={`url(#${p}_face)`} />
				{/* Wavy hair with subtle chic streak */}
				<path d="M18 27 C18 15 46 15 46 27 C46 35 43 38 43 38 C42 27 40 21 32 20 C24 21 22 27 21 38 C21 38 18 35 18 27 Z" fill="#374151" />
				<path d="M22 24 Q26 17 31 18" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Approachable, perceptive expression */}
				<path d="M23 22 Q27 20 30 22" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				<path d="M34 22 Q37 20 41 22" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" fill="none" />
				{/* Warm, connecting eyes */}
				<circle cx="27" cy="28" r="2" fill="#1e1b4b" />
				<circle cx="37" cy="28" r="2" fill="#1e1b4b" />
				<circle cx="27.8" cy="27.2" r="0.75" fill="#ffffff" />
				<circle cx="37.8" cy="27.2" r="0.75" fill="#ffffff" />
				{/* Warm engaged smile */}
				<path d="M28 35 Q32 39 36 35" stroke="#78350f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
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
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#d97706" />
						<stop offset="70%" stopColor="#b45309" />
						<stop offset="100%" stopColor="#78350f" />
					</radialGradient>
				</defs>
				<path d="M14 60 C14 47 50 47 50 60 Z" fill="#047857" />
				<circle cx="32" cy="30" r="13" fill={`url(#${p}_face)`} />
				{/* High Braided Afro Bun */}
				<circle cx="32" cy="14" r="9" fill="#171717" />
				<circle cx="32" cy="14" r="7" fill="#262626" />
				<path d="M19 26 C19 16 45 16 45 26 C44 21 39 19 32 19 C25 19 20 21 19 26 Z" fill="#171717" />
				{/* Gold Hoop Earrings */}
				<circle cx="18" cy="33" r="2.8" stroke="#facc15" strokeWidth="1.5" fill="none" />
				<circle cx="46" cy="33" r="2.8" stroke="#facc15" strokeWidth="1.5" fill="none" />
				{/* Perceptive eyes & confident smile */}
				<circle cx="27" cy="29" r="2" fill="#171717" />
				<circle cx="37" cy="29" r="2" fill="#171717" />
				<circle cx="27.8" cy="28.2" r="0.75" fill="#ffffff" />
				<circle cx="37.8" cy="28.2" r="0.75" fill="#ffffff" />
				<path d="M28 36 Q32 39 36 36" stroke="#451a03" strokeWidth="1.8" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	lucy: {
		id: "lucy",
		name: "Lucy",
		tagline: "Deep Epistemic Thinker",
		bgGradient: ["#ec4899", "#831843"],
		skin: "#fde047",
		hair: "#b45309",
		clothes: "#d97706",
		accent: "#f472b6",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#fef08a" />
						<stop offset="70%" stopColor="#fde047" />
						<stop offset="100%" stopColor="#ca8a04" />
					</radialGradient>
				</defs>
				{/* Mustard Turtleneck */}
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#d97706" />
				<rect x="26" y="38" width="12" height="8" rx="2" fill="#b45309" />
				<circle cx="32" cy="28" r="13" fill={`url(#${p}_face)`} />
				{/* Curly Hair Buns */}
				<circle cx="20" cy="20" r="6" fill="#b45309" />
				<circle cx="44" cy="20" r="6" fill="#b45309" />
				<circle cx="32" cy="16" r="7" fill="#b45309" />
				{/* Round Acetate Eyewear */}
				<circle cx="26.5" cy="27" r="4.5" stroke="#ec4899" strokeWidth="1.5" fill="none" />
				<circle cx="37.5" cy="27" r="4.5" stroke="#ec4899" strokeWidth="1.5" fill="none" />
				<line x1="31" y1="27" x2="33" y2="27" stroke="#ec4899" strokeWidth="1.5" />
				{/* Thoughtful deep eyes */}
				<circle cx="26.5" cy="27" r="1.6" fill="#1c1917" />
				<circle cx="37.5" cy="27" r="1.6" fill="#1c1917" />
				<circle cx="27" cy="26.4" r="0.6" fill="#ffffff" />
				<circle cx="38" cy="26.4" r="0.6" fill="#ffffff" />
				<path d="M29 34 Q32 36 35 34" stroke="#a16207" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	rj: {
		id: "rj",
		name: "RJ",
		tagline: "Verification Lead & Challenger",
		bgGradient: ["#0284c7", "#0f172a"],
		skin: "#fed7aa",
		hair: "#0f172a",
		clothes: "#1e1b4b",
		accent: "#38bdf8",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#1e1b4b" />
				<polygon points="28,48 32,55 36,48" fill="#0284c7" />
				<circle cx="32" cy="29" r="13" fill="#fed7aa" />
				{/* Modern Undercut Hairstyle */}
				<path d="M19 24 C19 14 45 13 45 23 C42 19 24 19 19 24 Z" fill="#0f172a" />
				{/* Direct Observant Eyes */}
				<circle cx="27" cy="28" r="2" fill="#0f172a" />
				<circle cx="37" cy="28" r="2" fill="#0f172a" />
				<circle cx="27.8" cy="27.2" r="0.7" fill="#ffffff" />
				<circle cx="37.8" cy="27.2" r="0.7" fill="#ffffff" />
				<path d="M28 35 Q32 37 36 35" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	raul: {
		id: "raul",
		name: "Raul",
		tagline: "Orchestrator & Mission Director",
		bgGradient: ["#f59e0b", "#78350f"],
		skin: "#fcd34d",
		hair: "#1c1917",
		clothes: "#064e3b",
		accent: "#f4b942",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#fef08a" />
						<stop offset="70%" stopColor="#fcd34d" />
						<stop offset="100%" stopColor="#f59e0b" />
					</radialGradient>
				</defs>
				{/* Torso / Crisp Mission Collar */}
				<path d="M14 60 C14 47 50 47 50 60 Z" fill="#064e3b" />
				<polygon points="32,47 29,56 32,60 35,56" fill="#fbbf24" />
				{/* Head */}
				<circle cx="32" cy="28" r="13" fill={`url(#${p}_face)`} />
				<path d="M19 23 C19 14 45 14 45 23 Z" fill="#1c1917" />
				{/* Direct Steady Gaze */}
				<circle cx="27" cy="27" r="2" fill="#1c1917" />
				<circle cx="37" cy="27" r="2" fill="#1c1917" />
				<circle cx="27.8" cy="26.3" r="0.7" fill="#ffffff" />
				<circle cx="37.8" cy="26.3" r="0.7" fill="#ffffff" />
				{/* Mustache & Calm Smile */}
				<path d="M26 33 Q32 31 38 33 Q32 36 26 33 Z" fill="#1c1917" />
				<path d="M29 37 Q32 39 35 37" stroke="#78350f" strokeWidth="1.2" strokeLinecap="round" fill="none" />
				{/* Mission Director Headset */}
				<path d="M18 28 C18 18 46 18 46 28" stroke="#374151" strokeWidth="2" strokeLinecap="round" fill="none" />
				<circle cx="46" cy="28" r="2.5" fill="#f59e0b" />
				<path d="M46 28 L40 35" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="39" cy="36" r="1.5" fill="#ef4444" />
			</g>
		),
	},
	operator: {
		id: "operator",
		name: "Operator",
		tagline: "Human Reviewer & Oversight",
		bgGradient: ["#f59e0b", "#b45309"],
		skin: "#fed7aa",
		hair: "#334155",
		clothes: "#1e293b",
		accent: "#facc15",
		svgContent: (p) => (
			<g id={p}>
				<defs>
					<radialGradient id={`${p}_face`} cx="40%" cy="35%" r="65%">
						<stop offset="0%" stopColor="#ffedd5" />
						<stop offset="70%" stopColor="#fed7aa" />
						<stop offset="100%" stopColor="#fdba74" />
					</radialGradient>
				</defs>
				{/* Torso / Modern Tech Hoodie / Jacket */}
				<path d="M14 60 C14 47 50 47 50 60 Z" fill="#1e293b" />
				<path d="M26 47 L32 58 L38 47" fill="#f59e0b" />
				{/* Neck */}
				<rect x="29" y="37" width="6" height="8" rx="2" fill="#fb923c" />
				{/* Head */}
				<circle cx="32" cy="28" r="13" fill={`url(#${p}_face)`} />
				{/* Modern Styled Hair */}
				<path d="M19 24 C19 14 45 14 45 24 C42 19 23 19 19 24 Z" fill="#334155" />
				{/* Attentive Eyes & Smile */}
				<circle cx="27" cy="27" r="2" fill="#0f172a" />
				<circle cx="37" cy="27" r="2" fill="#0f172a" />
				<circle cx="27.8" cy="26.3" r="0.75" fill="#ffffff" />
				<circle cx="37.8" cy="26.3" r="0.75" fill="#ffffff" />
				<path d="M28 34 Q32 38 36 34" stroke="#78350f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	tom: {
		id: "tom",
		name: "Tom",
		tagline: "Context & Memory Assessor",
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
		tagline: "Social & Community Specialist",
		bgGradient: ["#6366f1", "#312e81"],
		skin: "#fde047",
		hair: "#18181b",
		clothes: "#312e81",
		accent: "#a5b4fc",
		svgContent: (p) => (
			<g id={p}>
				<path d="M15 60 C15 48 49 48 49 60 Z" fill="#312e81" />
				<circle cx="32" cy="29" r="12" fill="#fde047" />
				<circle cx="43" cy="19" r="5" fill="#18181b" />
				<path d="M20 26 C20 15 44 15 44 26 Z" fill="#18181b" />
				<circle cx="27" cy="29" r="2" fill="#18181b" />
				<circle cx="37" cy="29" r="2" fill="#18181b" />
				<path d="M29 35 Q32 38 35 35" stroke="#854d0e" strokeWidth="1.5" strokeLinecap="round" fill="none" />
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
				<path d="M19 28 C19 15 45 15 45 28 C48 37 44 42 40 40 C43 32 41 22 32 20 C23 22 21 32 24 40 C20 42 16 37 19 28 Z" fill="#581c87" />
				<circle cx="27" cy="29" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="29" r="1.8" fill="#1c1917" />
				<path d="M29 35 Q32 38 35 35" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
	alex: {
		id: "alex",
		name: "Alex",
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
				<path d="M18 29 C18 16 46 16 46 29 C46 36 43 38 43 38 L43 27 L21 27 L21 38 C21 38 18 36 18 29 Z" fill="#09090b" />
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
				<circle cx="44" cy="18" r="6" fill="#ca8a04" />
				<path d="M19 27 C19 16 45 16 45 27 Z" fill="#ca8a04" />
				<circle cx="27" cy="30" r="1.8" fill="#1c1917" />
				<circle cx="37" cy="30" r="1.8" fill="#1c1917" />
				<path d="M29 36 Q32 39 35 36" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
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
				<path d="M19 27 C19 16 45 16 45 27 Z" fill="#b91c1c" />
				<circle cx="27" cy="30" r="2" fill="#1c1917" />
				<circle cx="37" cy="30" r="2" fill="#1c1917" />
				<path d="M28 36 Q32 40 36 36" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" fill="none" />
			</g>
		),
	},
};

const SEAT_TO_CARTOON: Record<string, string> = {
	factchecker: "priya",
	cloudarchitect: "marcus",
	synthesizer: "val",
	rivalchallenger: "arturo",
	thinker: "lucy",
	contextagent: "tom",
	crediblesourcesresearchagent: "priya",
	socialcommunityresearchagent: "jovita",
	orchestrator: "raul",
	user: "operator",
	operator: "operator",
};

/**
 * Get cartoon person by name, seatId, or ID, or return a deterministic default.
 * Guarantees every seat maps to a 3D coworker illustration, never animals or robots.
 */
export function getCartoonPerson(nameOrId?: string): CartoonPerson {
	if (!nameOrId) return CARTOON_PEOPLE.priya;

	const normalized = nameOrId.toLowerCase().trim();

	// Direct ID match
	if (CARTOON_PEOPLE[normalized]) {
		return CARTOON_PEOPLE[normalized];
	}

	// Seat ID alias match
	if (SEAT_TO_CARTOON[normalized] && CARTOON_PEOPLE[SEAT_TO_CARTOON[normalized]]) {
		return CARTOON_PEOPLE[SEAT_TO_CARTOON[normalized]];
	}

	// Name match
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
