import Database from "better-sqlite3";
import path from "node:path";
import type {
	AssessmentResult,
	FounderOnboardingState,
} from "@governmindz/founder-intelligence";
import type { FounderStore } from "@governmindz/founder-intelligence";

const CATALOG_DB_PATH = path.resolve(process.cwd(), "data", "conversations.db");
let catalogDb: Database.Database | null = null;

function getCatalogDb(): Database.Database {
	if (!catalogDb) {
		catalogDb = new Database(CATALOG_DB_PATH, { readonly: false });
		catalogDb.pragma("journal_mode = WAL");
		catalogDb.exec(`
			CREATE TABLE IF NOT EXISTS founder_onboarding (
				owner_id TEXT PRIMARY KEY,
				answers_json TEXT NOT NULL DEFAULT '{}',
				answered_at_json TEXT NOT NULL DEFAULT '{}',
				project_json TEXT,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS founder_assessments (
				id TEXT PRIMARY KEY,
				owner_id TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				ruleset_version TEXT NOT NULL,
				payload_json TEXT NOT NULL
			);

			CREATE INDEX IF NOT EXISTS founder_assessments_owner_idx
				ON founder_assessments (owner_id, created_at DESC);
		`);
	}
	return catalogDb;
}

export class SqliteFounderStore implements FounderStore {
	loadOnboarding(ownerId: string): FounderOnboardingState | null {
		const row = getCatalogDb()
			.prepare("SELECT * FROM founder_onboarding WHERE owner_id = ?")
			.get(ownerId) as any | undefined;
		if (!row) return null;
		return {
			answers: JSON.parse(row.answers_json) ?? {},
			answeredAt: JSON.parse(row.answered_at_json) ?? {},
			project: row.project_json ? JSON.parse(row.project_json) : undefined,
			updatedAt: row.updated_at,
		};
	}

	saveOnboarding(
		ownerId: string,
		state: FounderOnboardingState,
	): FounderOnboardingState {
		getCatalogDb()
			.prepare(
				`INSERT INTO founder_onboarding
					(owner_id, answers_json, answered_at_json, project_json, updated_at)
				VALUES (@ownerId, @answersJson, @answeredAtJson, @projectJson, @updatedAt)
				ON CONFLICT(owner_id) DO UPDATE SET
					answers_json = @answersJson,
					answered_at_json = @answeredAtJson,
					project_json = @projectJson,
					updated_at = @updatedAt`,
			)
			.run({
				ownerId,
				answersJson: JSON.stringify(state.answers),
				answeredAtJson: JSON.stringify(state.answeredAt),
				projectJson: state.project ? JSON.stringify(state.project) : null,
				updatedAt: state.updatedAt,
			});
		return state;
	}

	saveAssessment(ownerId: string, assessment: AssessmentResult): void {
		getCatalogDb()
			.prepare(
				`INSERT INTO founder_assessments
					(id, owner_id, created_at, ruleset_version, payload_json)
				VALUES (@id, @ownerId, @createdAt, @rulesetVersion, @payloadJson)
				ON CONFLICT(id) DO NOTHING`,
			)
			.run({
				id: assessment.id,
				ownerId,
				createdAt: assessment.createdAt,
				rulesetVersion: assessment.rulesetVersion,
				payloadJson: JSON.stringify(assessment),
			});
	}

	loadLatestAssessment(ownerId: string): AssessmentResult | null {
		const row = getCatalogDb()
			.prepare(
				"SELECT payload_json FROM founder_assessments WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1",
			)
			.get(ownerId) as any | undefined;
		return row ? (JSON.parse(row.payload_json) as AssessmentResult) : null;
	}

	listAssessments(ownerId: string): AssessmentResult[] {
		const rows = getCatalogDb()
			.prepare(
				"SELECT payload_json FROM founder_assessments WHERE owner_id = ? ORDER BY created_at DESC",
			)
			.all(ownerId) as any[];
		return rows.map((row) => JSON.parse(row.payload_json) as AssessmentResult);
	}
}

export const founderStore = new SqliteFounderStore();
