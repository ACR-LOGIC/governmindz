export function isConversationalInquiry(topic: string): boolean {
	const trimmed = topic.trim().toLowerCase();
	const greetings = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\b/i;
	const basicQuestions = /^(who are you|what can you do|what is governmindz|help)\b/i;
	if (trimmed.length < 50 && (greetings.test(trimmed) || basicQuestions.test(trimmed))) {
		if (!/zetaris|sec|fda|gleif|compliance|risk|database|query|data|governance|audit|catalog|standard/i.test(trimmed)) {
			return true;
		}
	}
	return false;
}
