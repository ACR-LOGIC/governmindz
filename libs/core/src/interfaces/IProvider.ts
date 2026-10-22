// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor

export interface ProviderRequestOptions {
	model?: string;
	seatIndex?: number;
	runId?: string;
	timeoutMs?: number;
	temperature?: number;
	max_tokens?: number;
	response_format?: {
		type: "json_object" | "text";
	};
}

export interface IProvider {
	getId?(): string;
	getName?(): string;
	getType(): string;
	chat(messages: any[], options?: ProviderRequestOptions): Promise<any>;
	streamChat?(
		messages: any[],
		onToken: (token: string) => void,
		options?: ProviderRequestOptions,
	): Promise<any>;
}
