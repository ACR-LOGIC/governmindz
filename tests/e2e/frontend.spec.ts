import { test, expect } from "@playwright/test";

test.describe("GovernMindz Mission Control Frontend", () => {
	test("Header, brand, and layout load properly", async ({ page }) => {
		await page.goto("/");

		// Verify Brand & Title
		await expect(page.locator("header")).toContainText("GovernMindz");
		await expect(page.locator("header")).toContainText("Mission Control");

		// Verify View Navigation
		await expect(page.getByRole("button", { name: "Conversation" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Execution" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Trust & Evidence" })).toBeVisible();

		// Verify Left Sidebar & New Debate button
		await expect(page.getByRole("button", { name: /New AI Debate/i })).toBeVisible();

		// Verify Right Sidebar Agent Roster
		const rightAside = page.locator("aside").filter({ hasText: "Agent Roster" });
		await expect(rightAside).toBeVisible();
		await expect(rightAside).toContainText("Fact Checker");
		await expect(rightAside).toContainText("Cloud Architect");
		await expect(rightAside).toContainText("Synthesizer");
	});

	test("Three integrated views switch seamlessly", async ({ page }) => {
		await page.goto("/");

		// View A: Conversation (default)
		await expect(page.getByRole("button", { name: "Conversation" })).toBeVisible();

		// Switch to View B: Execution Explorer
		await page.getByRole("button", { name: "Execution" }).click();
		await expect(page.getByText("Deterministic Workflow Execution Explorer")).toBeVisible();
		await expect(page.getByText("Chronological Transition Log")).toBeVisible();
		await expect(page.getByText("RECEIVED").first()).toBeVisible();

		// Switch to View C: Trust & Evidence
		await page.getByRole("button", { name: "Trust & Evidence" }).click();
		await expect(page.getByText("Zetaris Lightning Federated Data Catalog")).toBeVisible();
		await expect(page.getByText("SHOW LIGHTNING DATABASES")).toBeVisible();
		await expect(page.getByText("Tamper-Evident SHA-256 Cryptographic Ledger")).toBeVisible();
		await expect(page.getByText("c910699e010057fee5424ddcb6751ac88b20169be78af84a4741e0754e5d8b59")).toBeVisible();

		// Switch back to View A
		await page.getByRole("button", { name: "Conversation" }).click();
		await expect(page.getByRole("button", { name: /New AI Debate/i })).toBeVisible();
	});

	test("Agent inspection drawer opens and closes cleanly", async ({ page }) => {
		await page.goto("/");

		// Click on Fact Checker in roster
		await page.getByRole("button", { name: /Fact Checker/i }).click();

		// Drawer should appear
		await expect(page.getByRole("heading", { name: "Fact Checker" })).toBeVisible();
		await expect(page.getByText("Role Mandate & Boundaries")).toBeVisible();

		// Close drawer
		await page.getByTitle("Close agent inspection drawer").click();
		await expect(page.getByTitle("Close agent inspection drawer")).not.toBeVisible();
	});

	test("System Settings modal opens with functional tabs", async ({ page }) => {
		await page.goto("/");

		// Open Settings modal
		await page.getByLabel("Open settings").click();
		await expect(page.getByText("GovernMindz System Settings")).toBeVisible();

		// Verify Tabs
		await expect(page.getByRole("button", { name: "General" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Models & Providers" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Privacy & Data" })).toBeVisible();
		await expect(page.getByRole("button", { name: "About & Architecture" })).toBeVisible();

		// Click Models & Providers tab
		await page.getByRole("button", { name: "Models & Providers" }).click();
		await expect(page.getByText("Meterless Model Runtime")).toBeVisible();
		await expect(page.getByText("Zetaris Lightning Federated Data")).toBeVisible();

		// Click About tab
		await page.getByRole("button", { name: "About & Architecture" }).click();
		await expect(page.getByText("Open Agent Hackathon 2026")).toBeVisible();

		// Close modal
		await page.locator("div[role='dialog'], div.fixed").locator("button:has-text('✕'), button[class*='text-slate-400']").first().click();
	});

	test("Conversation history creation and message submission", async ({ page }) => {
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Create a new debate
		await page.getByRole("button", { name: /New AI Debate/i }).click();

		// Composer is available
		const composer = page.locator("textarea");
		await expect(composer).toBeVisible();

		// Submit a governance question
		await composer.fill("Evaluate read-only access controls for external AI agents.");
		await page.getByTitle("Submit Inquiry").click();

		// User message should appear in chat
		await expect(page.getByText("Evaluate read-only access controls for external AI agents.")).toBeVisible();
		await expect(page.getByText("You (Operator)")).toBeVisible();

		// Orchestrator announcement should appear
		await expect(page.getByText(/Inquiry initiated in/i)).toBeVisible({ timeout: 10000 });
	});
});
