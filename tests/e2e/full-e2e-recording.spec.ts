import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.describe("GovernMindz Complete End-to-End Recording & Journey", () => {
	test("Full interactive journey across all views, agent deliberation, and audit trail", async ({ page }) => {
		test.setTimeout(90000);

		const screenshotsDir = path.resolve(process.cwd(), "test-results", "recordings", "screenshots");
		if (!fs.existsSync(screenshotsDir)) {
			fs.mkdirSync(screenshotsDir, { recursive: true });
		}

		// 1. Visit Mission Control running via Vite Dev Server
		await page.goto("/");
		await page.waitForLoadState("networkidle");

		// Verify Brand & Core UI Elements
		await expect(page.locator("header")).toContainText("GovernMindz");
		await expect(page.locator("header")).toContainText("Mission Control");

		// Screenshot 1: Initial Dashboard State
		await page.screenshot({
			path: path.join(screenshotsDir, "01_dashboard_initial.png"),
			fullPage: true,
		});

		// 2. Click "New AI Debate" to prepare inquiry
		const newDebateBtn = page.getByRole("button", { name: /New AI Debate/i });
		await expect(newDebateBtn).toBeVisible();
		await newDebateBtn.click();

		// Verify Composer is ready
		const composer = page.locator("textarea");
		await expect(composer).toBeVisible();

		// 3. Submit a realistic governance inquiry
		const inquiryText = "Assess access controls and cryptographic validation before federated query execution.";
		await composer.fill(inquiryText);

		// Submit Inquiry
		const submitBtn = page.getByTitle("Submit Inquiry");
		await submitBtn.click();

		// Verify user message appears in chat stream
		await expect(page.getByText(inquiryText)).toBeVisible();
		await expect(page.getByText("You (Operator)")).toBeVisible();

		// Screenshot 2: Inquiry Submitted & Orchestrator Activation
		await expect(page.getByText(/Inquiry initiated in/i)).toBeVisible({ timeout: 10000 });
		await page.screenshot({
			path: path.join(screenshotsDir, "02_inquiry_submitted_orchestrator.png"),
			fullPage: true,
		});

		// 4. Wait for multi-agent deliberation to complete
		// FactChecker, CloudArchitect, and Synthesizer participate
		await expect(page.getByText("Consensus Achieved").first()).toBeVisible({
			timeout: 45000,
		});

		// Small pause to allow animations & confidence chips to stabilize
		await page.waitForTimeout(1500);

		// Screenshot 3: Multi-agent Deliberation & Final Consensus Card
		await page.screenshot({
			path: path.join(screenshotsDir, "03_multiagent_deliberation_consensus.png"),
			fullPage: true,
		});

		// 5. Open Agent Inspection Drawer for Fact Checker
		const rightAside = page.locator("aside").filter({ hasText: "Agent Roster" });
		await expect(rightAside).toBeVisible();
		await rightAside.getByRole("button", { name: /Fact Checker/i }).click();

		// Verify Agent Drawer Content
		await expect(page.getByRole("heading", { name: "Fact Checker" })).toBeVisible();
		await expect(page.getByText("Role Mandate & Boundaries")).toBeVisible();
		await expect(page.getByText(/Deliberation History/i)).toBeVisible();

		// Screenshot 4: Agent Inspection Drawer
		await page.screenshot({
			path: path.join(screenshotsDir, "04_agent_inspection_drawer.png"),
			fullPage: true,
		});

		// Close the drawer
		await page.getByTitle("Close agent inspection drawer").click();
		await expect(page.getByRole("heading", { name: "Fact Checker" })).not.toBeVisible();

		// 6. Navigate to View B: Execution Explorer
		await page.getByRole("button", { name: "Execution" }).click();
		await expect(page.getByText("Deterministic Workflow Execution Explorer")).toBeVisible();
		await expect(page.getByText("Chronological Transition Log")).toBeVisible();
		await expect(page.getByText(/12-state/i)).toBeVisible();
		await expect(page.getByText("RECEIVED").first()).toBeVisible();

		// Screenshot 5: Execution Explorer View
		await page.screenshot({
			path: path.join(screenshotsDir, "05_execution_explorer_timeline.png"),
			fullPage: true,
		});

		// 7. Navigate to View C: Trust & Evidence
		await page.getByRole("button", { name: "Trust & Evidence" }).click();
		await expect(page.getByText("Zetaris Lightning Federated Data Catalog")).toBeVisible();
		await expect(page.getByText("Tamper-Evident SHA-256 Cryptographic Ledger")).toBeVisible();

		// Screenshot 6: Trust & Evidence View
		await page.screenshot({
			path: path.join(screenshotsDir, "06_trust_evidence_catalog_ledger.png"),
			fullPage: true,
		});

		// 8. Open System Settings Modal
		await page.getByLabel("Open settings").click();
		await expect(page.getByText("GovernMindz System Settings")).toBeVisible();

		// Screenshot 7: Settings Modal (General Tab)
		await page.screenshot({
			path: path.join(screenshotsDir, "07_system_settings_modal.png"),
			fullPage: true,
		});

		// Click Models & Providers Tab
		await page.getByRole("button", { name: "Models & Providers" }).click();
		await expect(page.getByText("Meterless Model Runtime")).toBeVisible();
		await expect(page.getByText("Zetaris Lightning Federated Data", { exact: true })).toBeVisible();

		// Screenshot 8: Settings Modal (Models & Providers)
		await page.screenshot({
			path: path.join(screenshotsDir, "08_settings_models_providers.png"),
			fullPage: true,
		});

		// Close Settings Modal
		await page.getByLabel("Close settings").click();
		await expect(page.getByText("GovernMindz System Settings")).not.toBeVisible();

		// Return to Conversation View
		await page.getByRole("button", { name: "Conversation" }).click();
		await expect(page.getByRole("button", { name: /New AI Debate/i })).toBeVisible();

		// Final screenshot of restored conversation
		await page.screenshot({
			path: path.join(screenshotsDir, "09_conversation_view_restored.png"),
			fullPage: true,
		});

		// Obtain video recording and close page to flush video buffer
		const video = page.video();
		await page.close();
		if (video) {
			const videoSrc = await video.path();
			const dest = path.resolve(process.cwd(), "test-results", "recordings", "govern_mindz_e2e_full_journey.webm");
			fs.copyFileSync(videoSrc, dest);
			console.log(`Recorded video saved to: ${dest}`);
		}
	});
});
