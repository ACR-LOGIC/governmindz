import { test, expect } from "@playwright/test";

test.describe("Debate flow smoke", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			window.localStorage.setItem("governmindz_tour_completed", "true");
			window.localStorage.setItem("governmindz_launch_preference", "demo");
			window.localStorage.setItem("governmindz_mode_preference", "demo");
		});
	});

	test("app loads and health endpoint responds", async ({ page }) => {
		const res = await page.request.get("/api/health");
		expect(res.ok()).toBeTruthy();
		await page.goto("/");
		await page.waitForLoadState("networkidle");
		await expect(page).toHaveTitle(/GovernMindz/i);
	});

	test("composer accepts input", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");
		const input = page.getByRole("textbox").first();
		await input.fill("What is data governance?");
		await expect(input).toHaveValue("What is data governance?");
	});
});
