import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, Loader2 } from "lucide-react";

interface MessageComposerProps {
	onSendMessage: (topic: string) => void;
	isBusy: boolean;
	disabled?: boolean;
	defaultTopic?: string;
}

const TEMPLATE_QUESTIONS = [
	"Which governance controls verify Zetaris federated access before exposing to external agents?",
	"How to enforce read-only SQL guards on confidential database tables in real-time?",
	"Evaluate least-privilege audit readiness and hash-chained ledger integrity.",
];

export const MessageComposer: React.FC<MessageComposerProps> = ({
	onSendMessage,
	isBusy,
	disabled,
	defaultTopic,
}) => {
	const [text, setText] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// When defaultTopic changes and text is empty, we offer it
	const questions = defaultTopic ? [defaultTopic, ...TEMPLATE_QUESTIONS.filter((q) => q !== defaultTopic)] : TEMPLATE_QUESTIONS;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleSubmit = () => {
		if (isBusy || disabled) return;
		onSendMessage(text.trim());
		setText("");
	};

	const handleSelectTemplate = (template: string) => {
		setText(template);
		if (textareaRef.current) {
			textareaRef.current.focus();
		}
	};

	// Auto adjust textarea height
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
		}
	}, [text]);

	return (
		<div className="border-t border-[#1e2842] bg-[#0c101e]/90 backdrop-blur-md px-4 py-3 shrink-0">
			<div className="max-w-4xl mx-auto space-y-2">
				{/* Template suggestion chips */}
				<div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
					<span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1">
						<Sparkles className="w-3 h-3 text-amber-400" />
						Templates:
					</span>
					{questions.map((q, i) => (
						<button
							key={i}
							type="button"
							onClick={() => handleSelectTemplate(q)}
							disabled={isBusy}
							className={`px-2.5 py-1 rounded-full border text-[11px] truncate shrink-0 max-w-xs transition-colors ${
								i === 0 && defaultTopic
									? "bg-amber-950/60 border-amber-500/50 text-amber-300 hover:text-white"
									: "bg-[#12182b] hover:bg-[#18203a] border-[#1e2842] hover:border-[#2c385c] text-slate-300 hover:text-white"
							}`}
							title={q}
						>
							{i === 0 && defaultTopic ? `★ ${q}` : q}
						</button>
					))}
				</div>

				{/* Input box */}
				<div className="flex items-end gap-2 bg-[#12182b] border border-[#1e2842] focus-within:border-teal-500 rounded-2xl p-2 transition-colors shadow-lg">
					<textarea
						ref={textareaRef}
						rows={1}
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask a governance, access control, or federated data compliance question… (or send empty to run template)"
						disabled={isBusy || disabled}
						className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none p-1.5 max-h-36 overflow-y-auto leading-relaxed"
					/>

					{text && (
						<button
							type="button"
							onClick={() => setText("")}
							className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
							title="Clear input"
						>
							<X className="w-4 h-4" />
						</button>
					)}

					<button
						type="button"
						onClick={handleSubmit}
						disabled={isBusy || disabled}
						className={`flex items-center justify-center p-2.5 rounded-xl font-bold transition-all shadow-md active:scale-95 ${
							isBusy
								? "bg-[#18203a] text-slate-400 cursor-not-allowed"
								: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-950/40"
						}`}
						title="Submit Inquiry"
					>
						{isBusy ? <Loader2 className="w-4 h-4 animate-spin text-teal-400" /> : <Send className="w-4 h-4" />}
					</button>
				</div>
			</div>
		</div>
	);
};
