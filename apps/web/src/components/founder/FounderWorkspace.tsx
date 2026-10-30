import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	AlertTriangle,
	BadgeCheck,
	Building2,
	ChevronRight,
	ClipboardList,
	Gauge,
	Lightbulb,
	Loader2,
	RefreshCw,
	Sparkles,
	Target,
} from "lucide-react";
import type {
	FounderAssessment,
	FounderOnboardingSnapshot,
	FounderQuestion,
	FounderScore,
} from "../../types";
import {
	fetchFounderAssessment,
	fetchFounderOnboarding,
	runFounderAssessment,
	saveFounderAnswer,
} from "../../services/api";

const SECTION_ORDER = [
	"founder_profile",
	"financial_position",
	"business_legal",
	"project_identity",
	"development_status",
	"self_reported_stage",
	"team_capacity",
	"help_requested",
];

const SECTION_LABELS: Record<string, string> = {
	founder_profile: "Founder profile",
	financial_position: "Financial position",
	business_legal: "Business and legal",
	project_identity: "Project identity",
	development_status: "Development status",
	self_reported_stage: "Your stage",
	team_capacity: "Team capacity",
	help_requested: "What you need",
};

const FINDING_TONE: Record<string, string> = {
	confirmed_problem: "border-rose-500/40 bg-rose-500/10 text-rose-200",
	potential_problem: "border-amber-500/40 bg-amber-500/10 text-amber-200",
	recommendation: "border-sky-500/40 bg-sky-500/10 text-sky-200",
	missing_information: "border-slate-500/40 bg-slate-500/10 text-slate-300",
	strength: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

function scoreColor(score: number): string {
	if (score >= 75) return "text-emerald-300";
	if (score >= 50) return "text-teal-300";
	if (score >= 30) return "text-amber-300";
	return "text-rose-300";
}

function ScoreCard({ score }: { score: FounderScore }): React.ReactElement {
	return (
		<div className="rounded-xl border border-[#1e2436] bg-[#0f1420] p-4 space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-sm font-semibold text-slate-100">{score.label}</h3>
				<span className={`text-2xl font-bold ${scoreColor(score.score)}`}>{score.score}</span>
			</div>
			<div className="h-1.5 w-full rounded-full bg-[#1b2233]">
				<div
					className="h-1.5 rounded-full bg-gradient-to-r from-teal-400/70 to-amber-400/70"
					style={{ width: `${Math.max(2, Math.min(100, score.score))}%` }}
				/>
			</div>
			<p className="text-[11px] text-slate-400">
				{score.band} · confidence {Math.round(score.confidence * 100)}% · evidence coverage{" "}
				{score.evidenceCoverage}%
			</p>
			{score.findings.length > 0 && (
				<ul className="space-y-2">
					{score.findings.map((f) => (
						<li
							key={f.id}
							className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${FINDING_TONE[f.status] ?? FINDING_TONE.missing_information}`}
						>
							<div className="flex items-center gap-2 font-semibold">
								{f.status === "strength" ? (
									<BadgeCheck className="h-3.5 w-3.5" />
								) : f.status === "recommendation" ? (
									<Lightbulb className="h-3.5 w-3.5" />
								) : (
									<AlertTriangle className="h-3.5 w-3.5" />
								)}
								{f.title}
							</div>
							<p className="mt-1 text-slate-300/90">{f.detail}</p>
							{f.evidence.length > 0 && (
								<ul className="mt-1 space-y-0.5 text-[10px] text-slate-400">
									{f.evidence.map((e) => (
										<li key={e.id}>
											{e.source} — {e.verificationStatus}
										</li>
									))}
								</ul>
							)}
							{f.missingEvidence && f.missingEvidence.length > 0 && (
								<p className="mt-1 text-[10px] text-slate-500">
									Missing evidence: {f.missingEvidence.join(", ")}
								</p>
							)}
						</li>
					))}
				</ul>
			)}
			{score.missingEvidence.length > 0 && (
				<p className="text-[10px] text-slate-500">
					Still missing: {score.missingEvidence.join(", ")}
				</p>
			)}
		</div>
	);
}

interface QuestionFieldProps {
	question: FounderQuestion;
	value: string | number | boolean | string[] | null | undefined;
	onAnswer: (value: string | number | boolean | string[] | null) => void;
}

function QuestionField({ question, value, onAnswer }: QuestionFieldProps): React.ReactElement {
	const [draft, setDraft] = useState<string>(
		typeof value === "string" ? value : typeof value === "number" ? String(value) : "",
	);

	useEffect(() => {
		setDraft(
			typeof value === "string" ? value : typeof value === "number" ? String(value) : "",
		);
	}, [value]);

	if (question.kind === "boolean") {
		const active = value === true || value === false;
		return (
			<div className="flex gap-2">
				{[
					{ label: "Yes", val: true },
					{ label: "No", val: false },
				].map((option) => (
					<button
						key={option.label}
						type="button"
						onClick={() => onAnswer(option.val)}
						className={`rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors ${
							active && value === option.val
								? "border-teal-400/60 bg-teal-400/15 text-teal-200"
								: "border-[#232b3d] bg-[#0f1420] text-slate-400 hover:text-slate-200"
						}`}
					>
						{option.label}
					</button>
				))}
			</div>
		);
	}

	if (question.kind === "single_select" || question.kind === "multi_select") {
		const multi = question.kind === "multi_select";
		const selected = Array.isArray(value) ? value : [];
		return (
			<div className="flex flex-wrap gap-2">
				{(question.options ?? []).map((option) => {
					const isSelected = multi
						? selected.includes(option.value)
						: value === option.value;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								if (multi) {
									const next = isSelected
										? selected.filter((v) => v !== option.value)
										: [...selected, option.value];
									onAnswer(next);
								} else {
									onAnswer(option.value);
								}
							}}
							className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
								isSelected
									? "border-teal-400/60 bg-teal-400/15 text-teal-200"
									: "border-[#232b3d] bg-[#0f1420] text-slate-400 hover:text-slate-200"
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		);
	}

	if (question.kind === "number") {
		return (
			<div className="flex items-center gap-2">
				<input
					type="number"
					min={0}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => {
						const parsed = Number(draft);
						if (draft.trim() !== "" && Number.isFinite(parsed)) onAnswer(parsed);
					}}
					className="w-32 rounded-lg border border-[#232b3d] bg-[#0f1420] px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-400/60"
				/>
				<span className="text-[11px] text-slate-500">hours per week</span>
			</div>
		);
	}

	if (question.kind === "long_text") {
		return (
			<div className="space-y-2">
				<textarea
					value={draft}
					rows={3}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => onAnswer(draft.trim() === "" ? null : draft)}
					className="w-full resize-y rounded-lg border border-[#232b3d] bg-[#0f1420] px-3 py-2 text-xs text-slate-200 outline-none focus:border-teal-400/60"
				/>
				<p className="text-[10px] text-slate-500">Saved when you click away.</p>
			</div>
		);
	}

	return (
		<input
			type="text"
			value={draft}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={() => onAnswer(draft.trim() === "" ? null : draft)}
			className="w-full rounded-lg border border-[#232b3d] bg-[#0f1420] px-3 py-2 text-xs text-slate-200 outline-none focus:border-teal-400/60"
		/>
	);
}

export const FounderWorkspace: React.FC = () => {
	const [snapshot, setSnapshot] = useState<FounderOnboardingSnapshot | null>(null);
	const [assessment, setAssessment] = useState<FounderAssessment | null>(null);
	const [activeSection, setActiveSection] = useState<string>(SECTION_ORDER[0]);
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const [onboarding, latest] = await Promise.all([
				fetchFounderOnboarding(),
				fetchFounderAssessment(),
			]);
			setSnapshot(onboarding);
			setAssessment(latest);
			setError(null);
		} catch (e: any) {
			setError(e?.message || "Failed to load founder workspace.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const sections = useMemo(() => snapshot?.progress.sections ?? [], [snapshot]);
	const questions = useMemo(
		() => (snapshot?.questions ?? []).filter((q) => q.section === activeSection),
		[snapshot, activeSection],
	);

	const handleAnswer = useCallback(
		async (questionId: string, value: string | number | boolean | string[] | null) => {
			setBusy(true);
			try {
				const updated = await saveFounderAnswer(questionId, value);
				setSnapshot(updated);
				setError(null);
			} catch (e: any) {
				setError(e?.message || "Failed to save answer.");
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	const handleRunAssessment = useCallback(async () => {
		setBusy(true);
		try {
			const result = await runFounderAssessment();
			setAssessment(result);
			setError(null);
		} catch (e: any) {
			setError(e?.message || "Failed to compute assessment.");
		} finally {
			setBusy(false);
		}
	}, []);

	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center text-xs text-slate-400">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading founder workspace…
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto bg-[#0a0e1a] px-6 py-6">
			<div className="mx-auto max-w-6xl space-y-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="flex items-center gap-2 text-lg font-bold text-slate-100">
							<Sparkles className="h-5 w-5 text-[#f4b942]" /> Founder intelligence
						</h1>
						<p className="mt-1 max-w-2xl text-xs text-slate-400">
							GovernMindz records what you tell it, then evaluates the evidence independently. Your
							answers stay on this machine and can be resumed at any time.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<div className="text-right">
							<p className="text-[11px] text-slate-400">
								{snapshot?.progress.answered ?? 0} of {snapshot?.progress.total ?? 0} answered
							</p>
							<div className="mt-1 h-1.5 w-40 rounded-full bg-[#1b2233]">
								<div
									className="h-1.5 rounded-full bg-[#f4b942]"
									style={{ width: `${snapshot?.progress.percent ?? 0}%` }}
								/>
							</div>
						</div>
						<button
							type="button"
							onClick={() => void handleRunAssessment()}
							disabled={busy}
							className="flex items-center gap-2 rounded-lg border border-[#f4b942]/50 bg-[#f4b942]/10 px-4 py-2 text-xs font-semibold text-[#f4b942] transition-colors hover:bg-[#f4b942]/20 disabled:opacity-50"
						>
							{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5" />}
							Run assessment
						</button>
					</div>
				</div>

				{error && (
					<div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
						{error}
					</div>
				)}

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
					<nav className="space-y-1">
						{sections.map((section) => (
							<button
								key={section.section}
								type="button"
								onClick={() => setActiveSection(section.section)}
								className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
									activeSection === section.section
										? "border-teal-400/50 bg-teal-400/10 text-teal-200"
										: "border-transparent text-slate-400 hover:bg-[#111726] hover:text-slate-200"
								}`}
							>
								<span className="flex items-center gap-2">
									{section.section === "business_legal" ? (
										<Building2 className="h-3.5 w-3.5" />
									) : section.section === "help_requested" ? (
										<Target className="h-3.5 w-3.5" />
									) : section.section === "self_reported_stage" ? (
										<Gauge className="h-3.5 w-3.5" />
									) : (
										<ClipboardList className="h-3.5 w-3.5" />
									)}
									{section.label || SECTION_LABELS[section.section] || section.section}
								</span>
								<span className="flex items-center gap-1 text-[10px] text-slate-500">
									{section.answered}/{section.total}
									<ChevronRight className="h-3 w-3" />
								</span>
							</button>
						))}
					</nav>

					<div className="space-y-4">
						{questions.map((question) => (
							<div
								key={question.id}
								className="rounded-xl border border-[#1e2436] bg-[#0f1420] p-4"
							>
								<div className="flex items-start justify-between gap-3">
									<p className="text-xs font-semibold text-slate-200">{question.prompt}</p>
									{question.required && (
										<span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
											Required
										</span>
									)}
								</div>
								{question.helpText && (
									<p className="mt-1 text-[11px] text-slate-500">{question.helpText}</p>
								)}
								<div className="mt-3">
									<QuestionField
										question={question}
										value={snapshot?.answers?.[question.id]}
										onAnswer={(value) => void handleAnswer(question.id, value)}
									/>
								</div>
							</div>
						))}
					</div>
				</div>

				{assessment && (
					<div className="space-y-4">
						<div className="rounded-xl border border-[#1e2436] bg-[#0f1420] p-5">
							<div className="flex flex-wrap items-center justify-between gap-4">
								<div>
									<h2 className="text-sm font-bold text-slate-100">Evidence-based stage</h2>
									<p className="mt-1 max-w-2xl text-xs text-slate-400">
										{assessment.stageComparison.message}
									</p>
								</div>
								<div className="flex items-center gap-6 text-right">
									<div>
										<p className="text-[10px] uppercase tracking-wide text-slate-500">You said</p>
										<p className="text-sm font-semibold text-slate-200">
											{assessment.stageComparison.selfReportedLabel}
										</p>
									</div>
									<div>
										<p className="text-[10px] uppercase tracking-wide text-slate-500">Evidence says</p>
										<p className="text-sm font-semibold text-teal-300">
											{assessment.stageComparison.assessedLabel}
										</p>
									</div>
									<div>
										<p className="text-[10px] uppercase tracking-wide text-slate-500">Overall</p>
										<p className={`text-2xl font-bold ${scoreColor(assessment.overall.score)}`}>
											{assessment.overall.score}
										</p>
									</div>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{assessment.scores.map((score) => (
								<ScoreCard key={score.id} score={score} />
							))}
						</div>

						<div className="rounded-xl border border-[#1e2436] bg-[#0f1420] p-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm font-semibold text-slate-100">How the overall score is weighted</h3>
								<button
									type="button"
									onClick={() => void handleRunAssessment()}
									disabled={busy}
									className="flex items-center gap-1.5 rounded-lg border border-[#232b3d] px-3 py-1.5 text-[11px] text-slate-300 hover:text-slate-100 disabled:opacity-50"
								>
									<RefreshCw className="h-3 w-3" /> Recompute
								</button>
							</div>
							<ul className="mt-3 space-y-1.5 text-[11px] text-slate-400">
								{assessment.weighting.map((w) => (
									<li key={w.scoreId}>
										<span className="font-semibold text-slate-300">
											{Math.round(w.weight * 100)}%
										</span>{" "}
										{w.scoreId.replace(/_/g, " ")} — {w.rationale}
									</li>
								))}
								<li className="text-slate-500">
									Ruleset {assessment.rulesetVersion}. The overall score is capped near the weakest
									dimension so a strong area cannot hide a blocking gap elsewhere.
								</li>
							</ul>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
