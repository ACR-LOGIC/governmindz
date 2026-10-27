export function calculateInquiryScore(topic: string, evidenceRowCount: number): number {
	let inquiryScore = 5;
	if (topic.length > 120) inquiryScore += 1;
	if (evidenceRowCount > 5) inquiryScore += 1;
	if (/confidential|conflict|dispute|uncertain/i.test(topic)) inquiryScore += 2;
	return Math.max(1, Math.min(10, inquiryScore));
}
