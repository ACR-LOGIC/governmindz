import { test, expect } from "@playwright/test";

const DEMOS = [
	{
		card: /Solving Fragmented Intelligence/,
		finalAnswer: /Final Sourced Agreement/,
	},
	{
		card: /The Agent That Can Explain Why/,
		finalAnswer: /Final Executive Explanation/,
	},
	{
		card: /Reasoning Architecture/,
		finalAnswer: /Final Reasoning Architecture Decree/,
	},
];

test.describe("Demo mode track scenarios", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			window.localStorage.setItem("governmindz_tour_completed", "true");
			window.localStorage.setItem("governmindz_launch_preference", "demo");
			window.localStorage.setItem("governmindz_mode_preference", "demo");
			window.localStorage.removeItem("governmindz_demo_history");
			window.localStorage.removeItem("governmindz_demo_history_v1");
		});
	});

	test("all three track demos complete end to end", async ({ page }) => {
		test.setTimeout(300_000);

		await page.goto("/");
		await page.waitForLoadState("networkidle");

		await expect(page.getByRole("button", { name: /Track 0[123] ·/ })).toHaveCount(3);
		await expect(page.locator("select option")).toHaveCount(3);
		await expect(page.getByText("Regulatory Risk Analysis")).toHaveCount(0);
		await expect(page.getByText("PII Re-identification")).toHaveCount(0);
		await expect(page.getByText("Clinical Trials & Drug Safety")).toHaveCount(0);

		for (const demo of DEMOS) {
			await page.getByRole("button", { name: demo.card }).click();
			await page.getByRole("button", { name: /Start Demo/i }).click();

			await expect(page.getByText("Final Synthesized Governance Decision")).toBeVisible({
				timeout: 120_000,
			});
			await expect(page.getByText(demo.finalAnswer).first()).toBeVisible();
			await expect(page.getByText(/Run failed/)).toHaveCount(0);
		}

		// The last demo is Track 03. Exercise the interactive Zetaris evidence explorer.
		await page.getByRole("button", { name: /Explore Zetaris Data/i }).click();

		const explorer = page.getByTestId("zetaris-data-explorer");
		await expect(explorer).toBeVisible();
		await expect(explorer.getByText(/SELECT request_id/)).toBeVisible();
		await expect(explorer.getByText("Deterministic scenario", { exact: true })).toBeVisible();
		await expect(explorer.locator("tbody tr")).toHaveCount(4);

		// Sort descending by request_id.
		const requestIdHeader = explorer.getByRole("button", { name: /request_id/ });
		await requestIdHeader.click();
		await requestIdHeader.click();
		await expect(explorer.locator("tbody tr").first()).toContainText("REQ-704");

		// Search, inspect a row, and switch to raw JSON.
		await explorer.getByTestId("zetaris-search").fill("REQ-704");
		await expect(explorer.locator("tbody tr")).toHaveCount(1);
		await expect(explorer.getByText("REQ-701")).toHaveCount(0);
		await explorer.getByRole("button", { name: "Reset view" }).click();
		await expect(explorer.locator("tbody tr")).toHaveCount(4);

		await explorer.getByTestId("zetaris-inspect-0").click();
		await expect(explorer.getByTestId("zetaris-row-detail")).toContainText("request_id");
		await expect(explorer.getByTestId("zetaris-row-detail")).toContainText("REQ-701");

		await explorer.getByRole("button", { name: "Raw JSON" }).click();
		await expect(explorer.getByTestId("zetaris-raw-json")).toContainText('"query"');
		await expect(explorer.getByTestId("zetaris-raw-json")).toContainText("clinic_queue_state");

		// Download the full dataset in both formats.
		const csvDownload = page.waitForEvent("download");
		await explorer.getByTestId("zetaris-download-csv").click();
		expect((await csvDownload).suggestedFilename()).toBe("zetaris-evidence.csv");

		const jsonDownload = page.waitForEvent("download");
		await explorer.getByTestId("zetaris-download-json").click();
		expect((await jsonDownload).suggestedFilename()).toBe("zetaris-evidence.json");
	});
});
