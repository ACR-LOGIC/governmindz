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

	test("Agent inspection drawer opens and closes cleanly", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Agents join the roster only once a demo assignment starts
		await page.getByRole("button", { name: /Start Demo/i }).click();
		await expect(page.locator("#tour-roster button").first()).toBeVisible({ timeout: 15000 });

		// Click on Fact Checker in roster specifically
		const factCheckerItem = page.locator("#tour-roster button").filter({ hasText: /Fact Checker/i }).first();
		await expect(factCheckerItem).toBeVisible();
		await factCheckerItem.click();

		// Drawer should appear
		await expect(page.getByRole("heading", { name: "Fact Checker" })).toBeVisible();
		await expect(page.getByText("Role Mandate & Boundaries")).toBeVisible();

		// Close drawer
		await page.getByTitle("Close agent inspection drawer").click();
		await expect(page.getByTitle("Close agent inspection drawer")).not.toBeVisible();
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
		await expect(page.getByRole("button", { name: "About & Architecture" })).toBeVisible();

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

	test("Demo mode presents 3 distinct prompt bubbles and Start Over action", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Verify 3 distinct selectable bubbles in Demo mode
		await expect(page.getByRole("button", { name: /Research & Evidence/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /Technical Decision/i })).toBeVisible();
		await expect(page.getByRole("button", { name: /Conflicting Claims/i })).toBeVisible();

		// Verify free-text textarea is disabled/replaced
		await expect(page.locator("textarea")).not.toBeVisible();

		// Click "Start Demo" button
		await page.getByRole("button", { name: /Start Demo/i }).click();

		// Simulated debate runs and displays orchestrator announcement
		await expect(page.getByText(/Inquiry initiated in/i).first()).toBeVisible({ timeout: 10000 });

		// Start Over button should appear
		await expect(page.getByRole("button", { name: /Start Over/i }).first()).toBeVisible({ timeout: 10000 });
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
