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
	});
});
