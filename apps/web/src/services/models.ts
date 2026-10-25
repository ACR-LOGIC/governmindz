export interface ModelOption {
	id: string;
	name: string;
	shortName: string;
	provider: string;
	recommended?: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
	{
		id: "nemotron-3.5-lightning-30b-a3b",
		name: "NVIDIA Nemotron 30B",
		shortName: "Nemotron 30B",
		provider: "Meterless (Local Runtime)",
		recommended: true,
	},
	{
		id: "gemini-3.8-flash",
		name: "Gemini 3.8 Flash",
		shortName: "Gemini Flash",
		provider: "Google Gemini Cloud Route",
		recommended: false,
	},
	{
		id: "mistral-7b-nightshift",
		name: "Mistral 7B Instruct",
		shortName: "Mistral 7B",
		provider: "Nightshift Offline Queue",
		recommended: false,
	},
];
