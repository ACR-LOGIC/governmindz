/**
 * ZetarisFallbackCatalog.ts
 *
 * Implements Requirement R2 (F16): Structured fallback schema metadata and realistic
 * synthetic evidence for all 8 Lightning databases documented inline below:
 * 1. SEC_DATA (14 tables)
 * 2. OPENFDA_REST (2 tables)
 * 3. CLINICALTRIALS_REST (1 table)
 * 4. GLEIF_REST (1 table)
 * 5. POKEAPI_REST (2 tables)
 * 6. NY_TAXI (15 tables)
 * 7. COMPANY_DNS (2 tables)
 * 8. TPCDS_DB (24 tables)
 */

export interface FallbackColumn {
	name: string;
	type: string;
	nullable: boolean;
	key?: string;
}

export interface FallbackTable {
	name: string;
	description: string;
	columns: FallbackColumn[];
	syntheticRows: unknown[][];
	totalRowCount: number;
}

export interface FallbackDatabase {
	name: string;
	type: string;
	description: string;
	tables: Map<string, FallbackTable>;
}

export interface FallbackQueryResult {
	columns: string[];
	rows: unknown[][];
	total: number;
	timeUsed: number;
}

export class ZetarisFallbackCatalog {
	private readonly databases: Map<string, FallbackDatabase> = new Map();

	constructor() {
		this.initDatabases();
	}

	getDatabaseNames(): string[] {
		return Array.from(this.databases.keys());
	}

	getDatabase(name: string): FallbackDatabase | undefined {
		return this.databases.get(name.toUpperCase());
	}

	getTable(dbName: string, tableName: string): FallbackTable | undefined {
		const db = this.getDatabase(dbName);
		return db?.tables.get(tableName.toLowerCase());
	}

	/**
	 * Match read-only SQL and return structured schema or synthetic demonstration evidence.
	 */
	resolveQuery(sql: string, limit = 50): FallbackQueryResult {
		let cleanSql = sql.trim();
		while (cleanSql.endsWith(";")) {
			cleanSql = cleanSql.slice(0, -1).trim();
		}
		const upper = cleanSql.toUpperCase();

		// 1. SHOW LIGHTNING DATABASES
		if (upper.includes("SHOW") && upper.includes("DATABASES")) {
			return this.listDatabases();
		}

		// 2. SHOW TABLES
		if (upper.includes("SHOW") && upper.includes("TABLES")) {
			return this.listTables(cleanSql);
		}

		// 3. DESCRIBE / DESC
		if (upper.startsWith("DESCRIBE") || upper.startsWith("DESC ")) {
			return this.describeTable(cleanSql);
		}

		// 4. Healthcheck: SELECT 1
		if (/^SELECT\s+1\b/i.test(cleanSql)) {
			return {
				columns: ["?column?"],
				rows: [[1]],
				total: 1,
				timeUsed: 1,
			};
		}

		// 5. SELECT COUNT(*)
		if (/SELECT\s+COUNT\(\s*\*\s*\)/i.test(cleanSql)) {
			return this.resolveCountQuery(cleanSql);
		}

		// 6. SELECT ... FROM
		if (/^SELECT\b/i.test(cleanSql)) {
			return this.resolveSelectQuery(cleanSql, limit);
		}

		// Fallback generic response
		return {
			columns: ["status", "query", "note"],
			rows: [["SYNTHETIC_FALLBACK_OK", cleanSql, "Query evaluated against offline Zetaris Fallback Catalog."]],
			total: 1,
			timeUsed: 1,
		};
	}

	listDatabases(): FallbackQueryResult {
		const columns = ["database_name", "type", "description", "table_count"];
		const rows: unknown[][] = [];

		for (const [name, db] of this.databases.entries()) {
			rows.push([name, db.type, db.description, db.tables.size]);
		}

		return {
			columns,
			rows,
			total: rows.length,
			timeUsed: 2,
		};
	}

	private listTables(sql: string): FallbackQueryResult {
		const columns = ["database_name", "table_name", "table_type"];
		const rows: unknown[][] = [];

		// Check if FROM/IN <db> specified
		const match = sql.match(/(?:FROM|IN)\s+([A-Za-z0-9_]+)/i);
		const targetDb = match ? match[1].toUpperCase() : null;

		for (const [dbName, db] of this.databases.entries()) {
			if (targetDb && dbName !== targetDb) continue;
			for (const tableName of db.tables.keys()) {
				rows.push([dbName, tableName, "TABLE"]);
			}
		}

		return {
			columns,
			rows,
			total: rows.length,
			timeUsed: 2,
		};
	}

	private describeTable(sql: string): FallbackQueryResult {
		const columns = ["column_name", "data_type", "nullable", "key"];
		const rows: unknown[][] = [];

		// Extract target table name, e.g. "DESCRIBE SEC_DATA.apple_revenue_facts" or "DESC ny_taxi.trips"
		const match = sql.match(/^(?:DESCRIBE|DESC)\s+([A-Za-z0-9_.]+)/i);
		if (!match) {
			return { columns, rows, total: 0, timeUsed: 1 };
		}

		const fullTarget = match[1];
		const parts = fullTarget.split(".");
		let targetDb: string | undefined;
		let targetTable: string;

		if (parts.length === 2) {
			targetDb = parts[0];
			targetTable = parts[1];
		} else {
			targetTable = parts[0];
		}

		const table = this.findTable(targetTable, targetDb);
		if (table) {
			for (const col of table.columns) {
				rows.push([col.name, col.type, col.nullable ? "YES" : "NO", col.key ?? ""]);
			}
		}

		return {
			columns,
			rows,
			total: rows.length,
			timeUsed: 2,
		};
	}

	private resolveCountQuery(sql: string): FallbackQueryResult {
		const match = sql.match(/FROM\s+([A-Za-z0-9_.]+)/i);
		if (!match) {
			return { columns: ["count"], rows: [[0]], total: 1, timeUsed: 1 };
		}

		const fullTarget = match[1];
		const parts = fullTarget.split(".");
		const targetDb = parts.length === 2 ? parts[0] : undefined;
		const targetTable = parts.length === 2 ? parts[1] : parts[0];

		const table = this.findTable(targetTable, targetDb);
		const count = table ? table.totalRowCount : 1000;

		return {
			columns: ["count"],
			rows: [[count]],
			total: 1,
			timeUsed: 1,
		};
	}

	private resolveSelectQuery(sql: string, limit: number): FallbackQueryResult {
		const match = sql.match(/FROM\s+([A-Za-z0-9_.]+)/i);
		if (!match) {
			return {
				columns: ["result"],
				rows: [["ok"]],
				total: 1,
				timeUsed: 1,
			};
		}

		const fullTarget = match[1];
		const parts = fullTarget.split(".");
		const targetDb = parts.length === 2 ? parts[0] : undefined;
		const targetTable = parts.length === 2 ? parts[1] : parts[0];

		// Check explicit SQL LIMIT
		const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
		const effectiveLimit = limitMatch ? Math.min(Number(limitMatch[1]), limit) : limit;

		const table = this.findTable(targetTable, targetDb);
		if (!table) {
			return {
				columns: ["status", "table", "message"],
				rows: [["UNKNOWN_TABLE", fullTarget, "Table not in offline fallback catalog."]],
				total: 0,
				timeUsed: 1,
			};
		}

		const columns = table.columns.map((c) => c.name);
		const rows = table.syntheticRows.slice(0, effectiveLimit);

		return {
			columns,
			rows,
			total: table.totalRowCount,
			timeUsed: 3,
		};
	}

	private findTable(tableName: string, dbName?: string): FallbackTable | undefined {
		const lowerTable = tableName.toLowerCase();
		if (dbName) {
			const db = this.getDatabase(dbName);
			if (db?.tables.has(lowerTable)) {
				return db.tables.get(lowerTable);
			}
		}

		// Search across all databases if dbName omitted or not found
		for (const db of this.databases.values()) {
			if (db.tables.has(lowerTable)) {
				return db.tables.get(lowerTable);
			}
		}

		return undefined;
	}

	private initDatabases(): void {
		// 1. SEC_DATA (14 tables)
		const secTables = new Map<string, FallbackTable>();
		const revenueColumns: FallbackColumn[] = [
			{ name: "entity_id", type: "VARCHAR", nullable: false, key: "PRI" },
			{ name: "ticker", type: "VARCHAR", nullable: false },
			{ name: "fiscal_year", type: "INTEGER", nullable: false },
			{ name: "revenue", type: "BIGINT", nullable: false },
			{ name: "operating_income", type: "BIGINT", nullable: true },
			{ name: "net_income", type: "BIGINT", nullable: true },
			{ name: "filing_date", type: "VARCHAR", nullable: false },
		];
		const submissionColumns: FallbackColumn[] = [
			{ name: "accession_number", type: "VARCHAR", nullable: false, key: "PRI" },
			{ name: "cik", type: "VARCHAR", nullable: false },
			{ name: "form_type", type: "VARCHAR", nullable: false },
			{ name: "filing_date", type: "VARCHAR", nullable: false },
			{ name: "report_period", type: "VARCHAR", nullable: true },
		];

		const companies = [
			{ name: "apple", ticker: "AAPL", cik: "0000320193", rev: 383285000000, income: 96995000000 },
			{ name: "ibm", ticker: "IBM", cik: "0000051143", rev: 61860000000, income: 7502000000 },
			{ name: "oracle", ticker: "ORCL", cik: "0001341439", rev: 49954000000, income: 8503000000 },
			{ name: "walmart", ticker: "WMT", cik: "0000104169", rev: 648125000000, income: 15511000000 },
			{ name: "target", ticker: "TGT", cik: "0000027419", rev: 107412000000, income: 4138000000 },
			{ name: "ford", ticker: "F", cik: "0000037996", rev: 176191000000, income: 4347000000 },
			{ name: "tesla", ticker: "TSLA", cik: "0001318605", rev: 96773000000, income: 14997000000 },
		];

		for (const comp of companies) {
			secTables.set(`${comp.name}_revenue_facts`, {
				name: `${comp.name}_revenue_facts`,
				description: `SEC EDGAR annual revenue facts for ${comp.ticker}`,
				columns: revenueColumns,
				totalRowCount: 48,
				syntheticRows: [
					[`ENT-${comp.ticker}-2024`, comp.ticker, 2024, comp.rev, Math.round(comp.rev * 0.28), comp.income, "2024-11-01"],
					[`ENT-${comp.ticker}-2023`, comp.ticker, 2023, Math.round(comp.rev * 0.95), Math.round(comp.rev * 0.26), Math.round(comp.income * 0.92), "2023-11-03"],
					[`ENT-${comp.ticker}-2022`, comp.ticker, 2022, Math.round(comp.rev * 0.91), Math.round(comp.rev * 0.25), Math.round(comp.income * 0.88), "2022-10-28"],
					[`ENT-${comp.ticker}-2021`, comp.ticker, 2021, Math.round(comp.rev * 0.82), Math.round(comp.rev * 0.23), Math.round(comp.income * 0.80), "2021-10-29"],
					[`ENT-${comp.ticker}-2020`, comp.ticker, 2020, Math.round(comp.rev * 0.74), Math.round(comp.rev * 0.21), Math.round(comp.income * 0.72), "2020-10-30"],
				],
			});

			secTables.set(`${comp.name}_submissions_raw`, {
				name: `${comp.name}_submissions_raw`,
				description: `SEC raw 10-K/10-Q filing submissions for ${comp.ticker}`,
				columns: submissionColumns,
				totalRowCount: 120,
				syntheticRows: [
					[`0000${comp.cik}-24-000080`, comp.cik, "10-K", "2024-11-01", "2024-09-30"],
					[`0000${comp.cik}-24-000055`, comp.cik, "10-Q", "2024-08-02", "2024-06-29"],
					[`0000${comp.cik}-24-000023`, comp.cik, "10-Q", "2024-05-03", "2024-03-30"],
					[`0000${comp.cik}-23-000091`, comp.cik, "10-K", "2023-11-03", "2023-09-30"],
				],
			});
		}

		this.databases.set("SEC_DATA", {
			name: "SEC_DATA",
			type: "sec_edgar_xbrl",
			description: "SEC EDGAR XBRL company facts and financial filings",
			tables: secTables,
		});

		// 2. OPENFDA_REST (2 tables)
		const fdaTables = new Map<string, FallbackTable>();
		fdaTables.set("drug_labels_raw", {
			name: "drug_labels_raw",
			description: "FDA approved drug labeling specifications and indications",
			columns: [
				{ name: "id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "brand_name", type: "VARCHAR", nullable: false },
				{ name: "generic_name", type: "VARCHAR", nullable: false },
				{ name: "manufacturer", type: "VARCHAR", nullable: false },
				{ name: "active_ingredient", type: "VARCHAR", nullable: false },
				{ name: "indications", type: "VARCHAR", nullable: true },
				{ name: "warnings", type: "VARCHAR", nullable: true },
				{ name: "dosage", type: "VARCHAR", nullable: true },
			],
			totalRowCount: 3450,
			syntheticRows: [
				["FDA-00129", "Advil", "Ibuprofen", "Pfizer Consumer", "Ibuprofen 200mg", "Temporary relief of minor aches, pains, fever", "Internal bleeding risk with NSAIDs", "200mg every 4 to 6 hours"],
				["FDA-00214", "Motrin IB", "Ibuprofen", "Johnson & Johnson", "Ibuprofen 200mg", "Analgesic, antipyretic, anti-inflammatory", "Cardiovascular thrombotic event risk", "1 tablet every 4 hours while symptoms persist"],
				["FDA-00388", "Tylenol Extra Strength", "Acetaminophen", "Kenvue Inc", "Acetaminophen 500mg", "Pain reliever and fever reducer", "Severe liver damage warning if over 4000mg/day", "2 caplets every 6 hours"],
			],
		});

		fdaTables.set("adverse_reactions_raw", {
			name: "adverse_reactions_raw",
			description: "FDA MedWatch reported adverse reaction incidents (healthcare PII/PHI)",
			columns: [
				{ name: "reaction_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "patient_age", type: "INTEGER", nullable: true },
				{ name: "patient_sex", type: "VARCHAR", nullable: true },
				{ name: "medicinal_product", type: "VARCHAR", nullable: false },
				{ name: "reaction_meddra_pt", type: "VARCHAR", nullable: false },
				{ name: "serious", type: "BOOLEAN", nullable: false },
				{ name: "outcome", type: "VARCHAR", nullable: true },
			],
			totalRowCount: 18920,
			syntheticRows: [
				["MEDW-88102", 54, "FEMALE", "IBUPROFEN", "Gastrointestinal haemorrhage", true, "RECOVERED"],
				["MEDW-88103", 68, "MALE", "ACETAMINOPHEN", "Hepatic failure acute", true, "HOSPITALIZED"],
				["MEDW-88104", 32, "MALE", "IBUPROFEN", "Urticaria acute", false, "RESOLVED"],
			],
		});

		this.databases.set("OPENFDA_REST", {
			name: "OPENFDA_REST",
			type: "rest_api",
			description: "OpenFDA drug labeling and adverse reactions registry",
			tables: fdaTables,
		});

		// 3. CLINICALTRIALS_REST (1 table)
		const clinicalTables = new Map<string, FallbackTable>();
		clinicalTables.set("trials_raw", {
			name: "trials_raw",
			description: "ClinicalTrials.gov registered medical studies",
			columns: [
				{ name: "nct_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "title", type: "VARCHAR", nullable: false },
				{ name: "status", type: "VARCHAR", nullable: false },
				{ name: "phase", type: "VARCHAR", nullable: true },
				{ name: "condition", type: "VARCHAR", nullable: false },
				{ name: "intervention", type: "VARCHAR", nullable: false },
				{ name: "lead_sponsor", type: "VARCHAR", nullable: false },
				{ name: "start_date", type: "VARCHAR", nullable: true },
				{ name: "completion_date", type: "VARCHAR", nullable: true },
			],
			totalRowCount: 420,
			syntheticRows: [
				["NCT04518826", "Efficacy of Ibuprofen vs Acetaminophen in Post-Op Pain", "COMPLETED", "Phase 4", "Postoperative Pain", "Drug: Ibuprofen 400mg", "Mount Sinai Medical Center", "2020-09-01", "2023-04-15"],
				["NCT03891446", "Evaluation of Pediatric Antipyretic Formulations", "COMPLETED", "Phase 3", "Pediatric Fever", "Drug: Oral Ibuprofen Suspension", "Children's Hospital of Philadelphia", "2019-01-10", "2022-08-30"],
				["NCT05124987", "Safety Profile of Co-administered NSAIDs with ACE Inhibitors", "RECRUITING", "Phase 2", "Hypertension", "Drug: Ibuprofen + Lisinopril", "Mayo Clinic", "2022-03-01", "2025-12-31"],
			],
		});

		this.databases.set("CLINICALTRIALS_REST", {
			name: "CLINICALTRIALS_REST",
			type: "rest_api",
			description: "ClinicalTrials.gov registered human research protocols",
			tables: clinicalTables,
		});

		// 4. GLEIF_REST (1 table)
		const gleifTables = new Map<string, FallbackTable>();
		gleifTables.set("lei_records_raw", {
			name: "lei_records_raw",
			description: "Global Legal Entity Identifier (LEI) registry entries",
			columns: [
				{ name: "lei", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "legal_name", type: "VARCHAR", nullable: false },
				{ name: "jurisdiction", type: "VARCHAR", nullable: false },
				{ name: "category", type: "VARCHAR", nullable: false },
				{ name: "status", type: "VARCHAR", nullable: false },
				{ name: "registered_address", type: "VARCHAR", nullable: true },
			],
			totalRowCount: 8500,
			syntheticRows: [
				["HWUPKR0MPOU8FGXBT394", "Apple Inc.", "US-CA", "GENERAL", "ISSUED", "One Apple Park Way, Cupertino, CA 95014"],
				["549300V94O0O174Z7L83", "International Business Machines Corporation", "US-NY", "GENERAL", "ISSUED", "1 New Orchard Road, Armonk, NY 10504"],
				["2138006E88S88S1E8S54", "Oracle Corporation", "US-TX", "GENERAL", "ISSUED", "2300 Oracle Way, Austin, TX 78741"],
			],
		});

		this.databases.set("GLEIF_REST", {
			name: "GLEIF_REST",
			type: "rest_api",
			description: "Global Legal Entity Identifier corporate verification registry",
			tables: gleifTables,
		});

		// 5. POKEAPI_REST (2 tables)
		const pokeTables = new Map<string, FallbackTable>();
		const pokeColumns: FallbackColumn[] = [
			{ name: "id", type: "INTEGER", nullable: false, key: "PRI" },
			{ name: "name", type: "VARCHAR", nullable: false },
			{ name: "base_experience", type: "INTEGER", nullable: false },
			{ name: "height", type: "INTEGER", nullable: false },
			{ name: "weight", type: "INTEGER", nullable: false },
			{ name: "types", type: "VARCHAR", nullable: false },
			{ name: "abilities", type: "VARCHAR", nullable: false },
		];

		pokeTables.set("pikachu_facts", {
			name: "pikachu_facts",
			description: "Attributes and battle specifications for Pikachu",
			columns: pokeColumns,
			totalRowCount: 1,
			syntheticRows: [[25, "pikachu", 112, 4, 60, "electric", "static,lightning-rod"]],
		});

		pokeTables.set("charizard_facts", {
			name: "charizard_facts",
			description: "Attributes and battle specifications for Charizard",
			columns: pokeColumns,
			totalRowCount: 1,
			syntheticRows: [[6, "charizard", 267, 17, 905, "fire,flying", "blaze,solar-power"]],
		});

		this.databases.set("POKEAPI_REST", {
			name: "POKEAPI_REST",
			type: "rest_api",
			description: "RESTful nested JSON structure benchmark dataset",
			tables: pokeTables,
		});

		// 6. NY_TAXI (15 tables)
		const taxiTables = new Map<string, FallbackTable>();
		const tripCols: FallbackColumn[] = [
			{ name: "trip_id", type: "VARCHAR", nullable: false, key: "PRI" },
			{ name: "vendor_id", type: "INTEGER", nullable: false },
			{ name: "pickup_datetime", type: "VARCHAR", nullable: false },
			{ name: "dropoff_datetime", type: "VARCHAR", nullable: false },
			{ name: "passenger_count", type: "INTEGER", nullable: false },
			{ name: "trip_distance", type: "DECIMAL", nullable: false },
			{ name: "pickup_location_id", type: "INTEGER", nullable: false },
			{ name: "dropoff_location_id", type: "INTEGER", nullable: false },
			{ name: "fare_amount", type: "DECIMAL", nullable: false },
			{ name: "total_amount", type: "DECIMAL", nullable: false },
		];

		const tripSampleRows = [
			["TRIP-2024-99101", 1, "2024-10-12 08:14:00", "2024-10-12 08:32:00", 1, 3.4, 161, 237, 16.5, 21.8],
			["TRIP-2024-99102", 2, "2024-10-12 09:05:00", "2024-10-12 09:28:00", 2, 4.8, 230, 142, 22.0, 28.5],
			["TRIP-2024-99103", 1, "2024-10-12 11:30:00", "2024-10-12 11:45:00", 1, 1.9, 142, 161, 10.5, 14.0],
		];

		for (const tbl of ["trips", "taxi_trips", "yellow_taxi", "green_taxi"]) {
			taxiTables.set(tbl, {
				name: tbl,
				description: `NYC taxi passenger trip records (${tbl})`,
				columns: tripCols,
				totalRowCount: 1500000,
				syntheticRows: tripSampleRows,
			});
		}

		taxiTables.set("customers", {
			name: "customers",
			description: "NYC taxi passenger customer registry (contains direct PII)",
			columns: [
				{ name: "customer_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "full_name", type: "VARCHAR", nullable: false },
				{ name: "email", type: "VARCHAR", nullable: false },
				{ name: "phone", type: "VARCHAR", nullable: false },
				{ name: "card_token", type: "VARCHAR", nullable: false },
				{ name: "home_zone_id", type: "INTEGER", nullable: true },
			],
			totalRowCount: 45000,
			syntheticRows: [
				["CUST-7701", "Eleanor Vance", "e.vance@example.org", "+1-212-555-0199", "tok_visa_4412", 161],
				["CUST-7702", "Marcus Sterling", "m.sterling@example.org", "+1-212-555-0142", "tok_mc_9081", 230],
				["CUST-7703", "Amina Chen", "amina.chen@example.org", "+1-646-555-0188", "tok_amex_1123", 142],
			],
		});

		taxiTables.set("drivers", {
			name: "drivers",
			description: "NYC TLC licensed drivers registry (contains sensitive driver PII)",
			columns: [
				{ name: "driver_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "driver_name", type: "VARCHAR", nullable: false },
				{ name: "license_number", type: "VARCHAR", nullable: false },
				{ name: "vehicle_id", type: "VARCHAR", nullable: false },
				{ name: "rating", type: "DECIMAL", nullable: false },
				{ name: "status", type: "VARCHAR", nullable: false },
			],
			totalRowCount: 12000,
			syntheticRows: [
				["DRV-1004", "Tariq Mansour", "TLC-5401928", "VEH-9921", 4.92, "ACTIVE"],
				["DRV-1005", "Dmitri Kozlov", "TLC-5403319", "VEH-8812", 4.88, "ACTIVE"],
				["DRV-1006", "Carmen Morales", "TLC-5407721", "VEH-4402", 4.95, "ACTIVE"],
			],
		});

		for (const tbl of ["vehicles", "for_hire_vehicles"]) {
			taxiTables.set(tbl, {
				name: tbl,
				description: "NYC TLC registered fleet vehicles",
				columns: [
					{ name: "vehicle_id", type: "VARCHAR", nullable: false, key: "PRI" },
					{ name: "license_plate", type: "VARCHAR", nullable: false },
					{ name: "make", type: "VARCHAR", nullable: false },
					{ name: "model", type: "VARCHAR", nullable: false },
					{ name: "year", type: "INTEGER", nullable: false },
				],
				totalRowCount: 18000,
				syntheticRows: [
					["VEH-9921", "T719421C", "Toyota", "Camry Hybrid", 2022],
					["VEH-8812", "T820199C", "Ford", "Escape Hybrid", 2021],
				],
			});
		}

		taxiTables.set("driver_shifts", {
			name: "driver_shifts",
			description: "Driver work shift telemetry and duration",
			columns: [
				{ name: "shift_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "driver_id", type: "VARCHAR", nullable: false },
				{ name: "start_time", type: "VARCHAR", nullable: false },
				{ name: "end_time", type: "VARCHAR", nullable: false },
				{ name: "trips_completed", type: "INTEGER", nullable: false },
			],
			totalRowCount: 95000,
			syntheticRows: [
				["SHIFT-901", "DRV-1004", "2024-10-12 06:00:00", "2024-10-12 14:30:00", 18],
				["SHIFT-902", "DRV-1005", "2024-10-12 14:00:00", "2024-10-12 22:15:00", 21],
			],
		});

		taxiTables.set("surge_pricing", {
			name: "surge_pricing",
			description: "Operational real-time demand surge pricing multipliers",
			columns: [
				{ name: "zone_id", type: "INTEGER", nullable: false },
				{ name: "timestamp", type: "VARCHAR", nullable: false },
				{ name: "multiplier", type: "DECIMAL", nullable: false },
				{ name: "active_drivers", type: "INTEGER", nullable: false },
				{ name: "open_requests", type: "INTEGER", nullable: false },
			],
			totalRowCount: 52000,
			syntheticRows: [
				[161, "2024-10-12 08:30:00", 1.8, 14, 38],
				[237, "2024-10-12 08:30:00", 1.5, 22, 45],
				[142, "2024-10-12 08:30:00", 1.2, 35, 41],
			],
		});

		taxiTables.set("trip_payments", {
			name: "trip_payments",
			description: "Financial transactions and tip breakdown for completed taxi rides",
			columns: [
				{ name: "payment_id", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "trip_id", type: "VARCHAR", nullable: false },
				{ name: "amount", type: "DECIMAL", nullable: false },
				{ name: "method", type: "VARCHAR", nullable: false },
				{ name: "tax", type: "DECIMAL", nullable: false },
			],
			totalRowCount: 1500000,
			syntheticRows: [
				["PAY-99101", "TRIP-2024-99101", 21.8, "CREDIT", 0.5],
				["PAY-99102", "TRIP-2024-99102", 28.5, "CREDIT", 0.5],
			],
		});

		for (const tbl of ["taxi_zones", "zones"]) {
			taxiTables.set(tbl, {
				name: tbl,
				description: "NYC TLC geographic zones and boroughs",
				columns: [
					{ name: "location_id", type: "INTEGER", nullable: false, key: "PRI" },
					{ name: "borough", type: "VARCHAR", nullable: false },
					{ name: "zone_name", type: "VARCHAR", nullable: false },
					{ name: "service_zone", type: "VARCHAR", nullable: false },
				],
				totalRowCount: 263,
				syntheticRows: [
					[161, "Manhattan", "Midtown Center", "Yellow Zone"],
					[230, "Manhattan", "Times Sq/Theatre District", "Yellow Zone"],
					[142, "Manhattan", "Lincoln Square East", "Yellow Zone"],
					[237, "Manhattan", "Upper East Side South", "Yellow Zone"],
				],
			});
		}

		taxiTables.set("weather_data", {
			name: "weather_data",
			description: "NYC hourly meteorological observations",
			columns: [
				{ name: "recorded_at", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "temperature", type: "DECIMAL", nullable: false },
				{ name: "precipitation", type: "DECIMAL", nullable: false },
				{ name: "wind_speed", type: "DECIMAL", nullable: false },
			],
			totalRowCount: 8760,
			syntheticRows: [
				["2024-10-12 08:00:00", 58.2, 0.0, 6.4],
				["2024-10-12 09:00:00", 60.1, 0.0, 7.1],
			],
		});

		this.databases.set("NY_TAXI", {
			name: "NY_TAXI",
			type: "postgres_federated",
			description: "New York City TLC trip operations, customer PII, and driver registry",
			tables: taxiTables,
		});

		// 7. COMPANY_DNS (2 tables)
		const dnsTables = new Map<string, FallbackTable>();
		dnsTables.set("sic_codes_raw", {
			name: "sic_codes_raw",
			description: "Standard Industrial Classification (SIC V3) taxonomy",
			columns: [
				{ name: "sic_code", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "division", type: "VARCHAR", nullable: false },
				{ name: "industry_group", type: "VARCHAR", nullable: false },
				{ name: "description", type: "VARCHAR", nullable: false },
			],
			totalRowCount: 1520,
			syntheticRows: [
				["3571", "Manufacturing", "Computer and Office Equipment", "Electronic Computers (Apple Inc)"],
				["7372", "Services", "Computer Programming, Data Processing", "Prepackaged Software (Oracle, IBM)"],
				["5331", "Retail Trade", "General Merchandise Stores", "Variety Stores (Walmart, Target)"],
				["3711", "Manufacturing", "Motor Vehicles and Passenger Car Bodies", "Motor Vehicles (Ford, Tesla)"],
			],
		});

		dnsTables.set("sic_codes_v4_raw", {
			name: "sic_codes_v4_raw",
			description: "Updated Standard Industrial Classification (SIC V4) hierarchical mapping",
			columns: [
				{ name: "sic_code", type: "VARCHAR", nullable: false, key: "PRI" },
				{ name: "industry_title", type: "VARCHAR", nullable: false },
				{ name: "hierarchy_level", type: "INTEGER", nullable: false },
				{ name: "regulatory_scope", type: "VARCHAR", nullable: false },
			],
			totalRowCount: 1600,
			syntheticRows: [
				["3571", "Electronic Computers", 4, "SEC / FTC Regulated Tech Hardware"],
				["7372", "Prepackaged Software Enterprise", 4, "SEC / NIST Cybersecurity Scope"],
				["5331", "Variety Stores & Mega-retailers", 4, "FTC Consumer Protection"],
				["3711", "Motor Vehicles & Passenger Car Bodies", 4, "DOT / NHTSA Safety Mandate"],
			],
		});

		this.databases.set("COMPANY_DNS", {
			name: "COMPANY_DNS",
			type: "rest_api",
			description: "Standard Industrial Classification (SIC) company hierarchy",
			tables: dnsTables,
		});

		// 8. TPCDS_DB (24 benchmark tables)
		const tpcdsTables = new Map<string, FallbackTable>();
		const tpcdsTableNames = [
			"call_center", "catalog_page", "catalog_returns", "catalog_sales",
			"customer", "customer_address", "customer_demographics", "date_dim",
			"household_demographics", "income_band", "inventory", "item",
			"promotion", "reason", "ship_mode", "store",
			"store_returns", "store_sales", "time_dim", "warehouse",
			"web_page", "web_returns", "web_sales", "web_site",
		];

		for (const name of tpcdsTableNames) {
			tpcdsTables.set(name, {
				name,
				description: `TPC-DS decision support benchmark table: ${name}`,
				columns: [
					{ name: `${name}_sk`, type: "INTEGER", nullable: false, key: "PRI" },
					{ name: `${name}_id`, type: "VARCHAR", nullable: false },
					{ name: "record_timestamp", type: "VARCHAR", nullable: true },
					{ name: "metric_value", type: "DECIMAL", nullable: true },
				],
				totalRowCount: 100000,
				syntheticRows: [
					[1, `${name.toUpperCase()}-001`, "2024-01-01 00:00:00", 142.5],
					[2, `${name.toUpperCase()}-002`, "2024-01-01 01:00:00", 258.1],
					[3, `${name.toUpperCase()}-003`, "2024-01-01 02:00:00", 99.4],
				],
			});
		}

		this.databases.set("TPCDS_DB", {
			name: "TPCDS_DB",
			type: "benchmark_parquet",
			description: "TPC-DS decision support standard benchmark data warehouse",
			tables: tpcdsTables,
		});
	}
}

export const defaultZetarisFallbackCatalog = new ZetarisFallbackCatalog();
