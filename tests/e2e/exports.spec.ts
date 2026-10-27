import { test, expect } from "@playwright/test";

test.describe("Conversation exports", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			window.localStorage.setItem("governmindz_tour_completed", "true");
			window.localStorage.setItem("governmindz_launch_preference", "demo");
			window.localStorage.setItem("governmindz_mode_preference", "demo");
			window.localStorage.removeItem("governmindz_demo_history");
			window.localStorage.removeItem("governmindz_demo_history_v1");
		});
	});

	test("downloads a real PDF after a completed demo", async ({ page }) => {
		test.setTimeout(180_000);
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		await page.getByRole("button", { name: /Run Deliberation on this Template/i }).click();
		await expect(page.getByText("Final Synthesized Governance Decision")).toBeVisible({
			timeout: 120_000,
		});

		const exportButton = page.getByRole("button", { name: /Export debate outputs/i });
		await expect(exportButton).toBeEnabled();
		await exportButton.click();

		const downloadAll = page.locator("#tour-download-all");
		await expect(downloadAll).toBeEnabled();

		const downloadPromise = page.waitForEvent("download");
		await page.getByRole("button", { name: /Executive Report/i }).click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
	});
});
