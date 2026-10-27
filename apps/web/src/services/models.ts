export interface ModelOption {
	id: string;
	name: string;
	shortName: string;
	provider: string;
	recommended?: boolean;
}

export const AVAILABLE_MODELS: ModelOption[] = [
	{
		id: "meterless/auto",
		name: "Meterless Auto",
		shortName: "Meterless Auto",
		provider: "Meterless / Nightshift",
		recommended: true,
	},
	{
		id: "meterless/fast",
		name: "Meterless Fast",
		shortName: "Meterless Fast",
		provider: "Meterless / Nightshift",
		recommended: false,
	},
	{
		id: "meterless/deep",
		name: "Meterless Deep",
		shortName: "Meterless Deep",
		provider: "Meterless / Nightshift",
		recommended: false,
	},
];
