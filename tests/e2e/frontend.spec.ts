import { test, expect } from "@playwright/test";

test.describe("GovernMindz Mission Control Frontend", () => {
	test.beforeEach(async ({ page }) => {
		// By default, set tour as completed and mode as demo so tests can interact cleanly
		await page.addInitScript(() => {
			window.localStorage.setItem("governmindz_tour_completed", "true");
			window.localStorage.setItem("governmindz_launch_preference", "demo");
			window.localStorage.setItem("governmindz_mode_preference", "demo");
		});
	});

	test("Interactive Onboarding Tour functions with Next, Back, and Skip", async ({ page }) => {
		// Clear tour completion so tour opens on this specific test
		await page.addInitScript(() => {
			window.localStorage.setItem("governmindz_tour_completed", "false");
			window.localStorage.setItem("governmindz_launch_preference", "demo");
		});
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Verify Tour dialog appears on first launch
		await expect(page.getByText("Step 1 of 5")).toBeVisible();
		await expect(page.getByText("AI Multi-Agent Group Chat")).toBeVisible();

		// Click Next to Step 2
		await page.getByRole("button", { name: /Next/i }).click();
		await expect(page.getByText("Step 2 of 5")).toBeVisible();
		await expect(page.getByText("Active Agent Council & Live Reasoning")).toBeVisible();

		// Click Back to Step 1 (exact match to avoid matching scenario text)
		await page.getByRole("button", { name: "Back", exact: true }).click();
		await expect(page.getByText("Step 1 of 5")).toBeVisible();

		// Click Skip Introduction
		await page.getByRole("button", { name: /Skip Introduction/i }).click();
		await expect(page.getByText("Step 1 of 5")).not.toBeVisible();
	});

	test("Header, brand, and layout load properly", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Verify Brand & Title
		await expect(page.locator("header")).toContainText("GovernMindz");
		await expect(page.locator("header")).toContainText("Mission Control");

		// Verify View Navigation
		await expect(page.locator("#tour-explorer").getByRole("button", { name: "Conversation", exact: true })).toBeVisible();
		await expect(page.locator("#tour-explorer").getByRole("button", { name: "Execution", exact: true })).toBeVisible();
		await expect(page.locator("#tour-explorer").getByRole("button", { name: "Trust & Evidence", exact: true })).toBeVisible();

		// Verify Left Sidebar & New Debate button
		await expect(page.getByRole("button", { name: /New AI Debate/i })).toBeVisible();

		// Verify Right Sidebar Agent Roster
		const rightAside = page.locator("aside").filter({ hasText: "Agent Roster" });
		await expect(rightAside).toBeVisible();
		// Roster starts visually empty: no pre-populated agents before an assignment begins
		await expect(rightAside).toContainText("Roster Empty");
		await expect(page.locator("#tour-roster button")).toHaveCount(0);

		// Verify Mode pill
		await expect(page.locator("#tour-mode")).toBeVisible();
	});

	test("Three integrated views switch seamlessly", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// View A: Conversation (default)
		await expect(page.locator("#tour-explorer").getByRole("button", { name: "Conversation", exact: true })).toBeVisible();

		// Switch to View B: Execution Explorer
		await page.locator("#tour-explorer").getByRole("button", { name: "Execution", exact: true }).click();
		await expect(page.getByText("Deterministic Workflow Execution Explorer")).toBeVisible();
		await expect(page.getByText("Chronological Transition Log")).toBeVisible();
		await expect(page.getByText("RECEIVED").first()).toBeVisible();

		// Switch to View C: Trust & Evidence
		await page.locator("#tour-explorer").getByRole("button", { name: "Trust & Evidence", exact: true }).click();
		await expect(page.getByText("Zetaris Lightning Federated Data Catalog")).toBeVisible();
		await expect(page.getByText("SHOW LIGHTNING DATABASES")).toBeVisible();
		await expect(page.getByText("Tamper-Evident SHA-256 Cryptographic Ledger")).toBeVisible();
		await expect(page.getByText("c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59")).toBeVisible();

		// Switch back to View A
		await page.locator("#tour-explorer").getByRole("button", { name: "Conversation", exact: true }).click();
		await expect(page.getByRole("button", { name: /New AI Debate/i })).toBeVisible();
	});

	test("System Settings modal opens with functional tabs and Replay Tour", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Open Settings modal
		await page.getByLabel("Open settings").click();
		await expect(page.getByText("GovernMindz System Settings")).toBeVisible();

		// Verify Tabs
		await expect(page.getByRole("button", { name: "General" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Models & Providers" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Privacy & Data" })).toBeVisible();
		await expect(page.getByRole("button", { name: "About GovernMindz" })).toBeVisible();

		// Verify Replay Tour button exists
		await expect(page.getByRole("button", { name: /Replay UI Tour/i })).toBeVisible();

		// Click Models & Providers tab
		await page.getByRole("button", { name: "Models & Providers" }).click();
		await expect(page.getByText("Meterless Model Runtime")).toBeVisible();
		await expect(page.getByText("Zetaris Lightning Federated Data")).toBeVisible();
		await expect(page.getByRole("button", { name: /Configure Credentials/i })).toBeVisible();

		// Close modal
		await page.locator("button[aria-label='Close settings']").click();
	});

	test("Transition to Live mode opens confirmation dialog and enables text entry", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Click mode toggle
		await page.locator("#tour-mode").click();

		// Confirmation dialog appears
		await expect(page.getByText("Switch to Live Execution Mode")).toBeVisible();
		await expect(page.getByText("Yes — Show Demo Again")).toBeVisible();
		await expect(page.getByText("No — Open Live Mode Next Time")).toBeVisible();

		// Confirm Live Mode
		await page.getByRole("button", { name: /Confirm Live Mode/i }).click();

		// Live Mode active - free text textarea is now visible!
		const composer = page.locator("textarea");
		await expect(composer).toBeVisible();
	});
});
