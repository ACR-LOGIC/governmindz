// biome-ignore-all lint/suspicious/noExplicitAny: legacy untyped interfaces pending refactor
// Copyright (c) 2026 ACR Logic.

/**
 * ProviderInterface — Base class for all provider implementations.
 * Extracted to its own file to prevent circular dependency between
 * ProviderFactory and any provider classes
 * that need to extend this base while being imported by ProviderFactory).
 */

export class ProviderInterface {
	static readonly providerId: string = "base";
	static readonly providerName: string = "Base Provider";

	apiKey: string;
	model: string;
	baseUrl: string;

	constructor(
		config: { apiKey?: string; model?: string; baseUrl?: string } = {},
	) {
		this.apiKey = config.apiKey || "";
		this.model = config.model || "";
		this.baseUrl = config.baseUrl || "";
	}

	validateConfig(): boolean {
		return Boolean(this.apiKey && this.model);
	}

	async chat(_messages: any[], _options?: any): Promise<any> {
		throw new Error("chat() must be implemented by provider subclasses");
	}

	getId(): string {
		return ProviderInterface.providerId;
	}

	getName(): string {
		return ProviderInterface.providerName;
	}

	getType(): string {
		return ProviderInterface.providerId;
	}
}
