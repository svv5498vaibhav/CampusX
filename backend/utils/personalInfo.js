/*
 * Basic detection of private details students shouldn't post anonymously: phone numbers, email and UPI
 * addresses, card/Aadhaar-style numbers, passwords or OTPs written out, and home addresses. It is a
 * guard rail, not a guarantee; the patterns are kept narrow so ordinary text (years, room numbers,
 * prices, "the OTP isn't coming") passes. Matched text is never logged or echoed back.
 */

const PATTERNS = [
  // name, pattern
  ['an email address', /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i],
  ['a UPI ID', /\b[a-z0-9._-]{2,}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|ibl|axl|paytm|upi|apl|ptyes|ptaxis|pthdfc|ptsbi)\b/i],
  // Indian mobile numbers: 98765 43210, +91-9876543210, 09876543210.
  ['a phone number', /(?<![\d+])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/],
  // Other international numbers written with a leading +.
  ['a phone number', /\+\d{1,3}[\s-]?\d(?:[\s-]?\d){7,12}(?!\d)/],
  // Card numbers (13-19 digits in groups) and Aadhaar-style 12-digit numbers, but not a list of years.
  ['a card or ID number', (text) => [...text.matchAll(/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?:[\s-]?\d{1,7})?(?!\d)/g)].some(([found]) => !isYearList(found))],
  // A password, OTP, PIN or CVV followed by something that looks like the secret itself.
  ['a password or code', /\b(?:password|passwd|pwd|passcode|otp|one[\s-]?time[\s-]?password|pin|cvv)\b\s*(?:is|was|:|=|-)\s*\S*[\d@#$%^&*!]\S*/i],
  // Home addresses ("house no 12", "flat no. 4B", "H.No 7", "plot no 21").
  ['a home address', /\b(?:house|flat|plot|h\.?)\s*(?:no\.?|number|#)\s*[:\-]?\s*[a-z]?\d+/i],
];

/** "2021 2022 2023" is a list of years, not an ID number. */
function isYearList(digits) {
  const groups = digits.split(/[\s-]/);
  return groups.length > 1 && groups.every((group) => /^(19|20)\d\d$/.test(group));
}

/** What kind of private detail the text seems to contain ("a phone number"), or null. */
export function findPersonalInfo(text) {
  if (typeof text !== 'string' || !text) return null;
  const match = PATTERNS.find(([, pattern]) => (typeof pattern === 'function' ? pattern(text) : pattern.test(text)));
  return match ? match[0] : null;
}

export const personalInfoMessage = (kind) =>
  `This post may contain personal information (${kind}). Please remove private details before posting.`;
