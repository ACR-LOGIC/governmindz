function getEffectiveAuditSecret(secretOverride?: string): string {
	const secret = (secretOverride ?? process.env.AUDIT_TRAIL_SECRET ?? "").trim();
	if (!secret || secret.length < 16) {
		throw new Error("AUDIT_TRAIL_SECRET is missing or too short; audit verification is disabled.");
	}
	return secret;
}

function handleFeedback(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}

	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { conversationId, messageId, seatId, rating, round, userComment } = payload;
			if (!conversationId || !messageId || !seatId || !rating) {
				sendJson(res, 400, { error: "Missing required fields: conversationId, messageId, seatId, rating" });
				return;
			}
			if (rating !== "up" && rating !== "down" && rating !== "wrong") {
				sendJson(res, 400, { error: "rating must be 'up', 'down', or 'wrong'" });
				return;
			}

			// 1. Insert into message_feedback table
			const insertStmt = db.prepare(`
				INSERT INTO message_feedback (conversation_id, message_id, seat_id, rating, round, comment, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			const now = Date.now();
			insertStmt.run(conversationId, messageId, seatId, rating, round ?? null, userComment ?? null, now);

			// 2. Update CredibilityManager
			const updated = credibilityManager.recordRating(seatId, rating, round);

			// 3. Upsert into agent_credibility table
			const upsertStmt = db.prepare(`
				INSERT INTO agent_credibility (seat_id, alpha, beta, sample_count, credibility_score, weight_multiplier, updated_at)
				VALUES (@seat_id, @alpha, @beta, @sample_count, @credibility_score, @weight_multiplier, @updated_at)
				ON CONFLICT(seat_id) DO UPDATE SET
					alpha = excluded.alpha,
					beta = excluded.beta,
					sample_count = excluded.sample_count,
					credibility_score = excluded.credibility_score,
					weight_multiplier = excluded.weight_multiplier,
					updated_at = excluded.updated_at
			`);
			upsertStmt.run({
				seat_id: updated.seatId,
				alpha: updated.alpha,
				beta: updated.beta,
				sample_count: updated.sampleCount,
				credibility_score: updated.credibilityScore,
				weight_multiplier: updated.weightMultiplier,
				updated_at: updated.updatedAt,
			});

			// 4. Update HMemService
			hmem.recordFeedback(conversationId, messageId, seatId, rating);

			// 5. Emit governance_recalibration audit event
			auditTrail.emitGovernanceRecalibration({
				sessionId: conversationId,
				seatId,
				rating,
				credibilityScore: updated.credibilityScore,
				weightMultiplier: updated.weightMultiplier,
				alpha: updated.alpha,
				beta: updated.beta,
				sampleCount: updated.sampleCount,
			});

			// 6. Return response
			sendJson(res, 200, { success: true, updatedCredibility: updated });
		} catch (err: any) {
			sendJson(res, 500, { error: err.message || "Feedback processing failed" });
		}
	});
}

function handleAuditVerify(req: http.IncomingMessage, res: http.ServerResponse) {
	if (req.method !== "POST") {
		res.writeHead(405);
		res.end();
		return;
	}

	let body = "";
	req.on("data", (c: any) => (body += c));
	req.on("end", () => {
		try {
			const payload = JSON.parse(body || "{}");
			const { conversationId, secret } = payload;
			let events = payload.auditEvents;

			if (!Array.isArray(events) && conversationId) {
				const conv = getConversationById(conversationId);
				if (conv && Array.isArray(conv.auditEvents)) {
					events = conv.auditEvents;
				}
			}

			if (!Array.isArray(events)) {
				events = [];
			}

			const effectiveSecret = getEffectiveAuditSecret(secret);
			const report = AuditChainVerifier.verify(events, effectiveSecret);
			sendJson(res, 200, report);
		} catch (err: any) {
			sendJson(res, 500, { error: err.message || "Audit verification failed" });
		}
	});
}

function handleAuditCertificate(req: http.IncomingMessage, res: http.ServerResponse, id: string) {
	if (req.method !== "GET") {
		res.writeHead(405);
		res.end();
		return;
	}

	try {
		const conv = getConversationById(id);
		if (!conv) {
			sendJson(res, 404, { error: "Conversation not found" });
			return;
		}

		const events = Array.isArray(conv.auditEvents) ? conv.auditEvents : [];
		const effectiveSecret = getEffectiveAuditSecret();
		const report = AuditChainVerifier.verify(events, effectiveSecret);
		const certificate = AuditChainVerifier.generateProofCertificate(report, id, effectiveSecret);
		sendJson(res, 200, certificate);
	} catch (err: any) {
		sendJson(res, 500, { error: err.message || "Failed to generate audit certificate" });
	}
}
