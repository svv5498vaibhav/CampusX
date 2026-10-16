/**
 * Resume PDFs use the standard PDF fonts (Helvetica, Times, Courier). They draw the Windows-1252
 * characters: English letters, accented Latin letters, common punctuation, •, –, —, curly quotes and €.
 * Anything else is swapped for a close equivalent here (₹ → Rs., → → ->, ā → a) or left out, so the
 * preview and the PDF always show the same text. The backend's checker uses the same table
 * (backend/services/resumeAnalysisService.js) to warn about characters that would be left out.
 */

const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

const isWinAnsi = (char) => {
  const code = char.codePointAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.includes(char);
};

const REPLACEMENTS = {
  '₹': 'Rs.',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '✓': '',
  '✔': '',
  '★': '*',
  '☆': '*',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '″': '"',
  '′': "'",
  '≥': '>=',
  '≤': '<=',
  '≈': '~',
  '▪': '•',
  '◦': '•',
  '●': '•',
  '○': '•',
  '■': '•',
  '□': '•',
  '►': '>',
  '▸': '>',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
};

const cache = new Map();

/** `text` with every character the PDF fonts can draw; whitespace collapsed (but not trimmed). */
export function pdfSafe(text) {
  if (!text) return '';
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  let out = '';
  for (const char of String(text)) {
    if (char === '\n' || char === '\t' || char === '\r') out += ' ';
    else if (isWinAnsi(char)) out += char;
    else if (REPLACEMENTS[char] !== undefined) out += REPLACEMENTS[char];
    else {
      // Accented letters outside Windows-1252 (ā, ś, ṇ): drop the accent.
      const base = [...char.normalize('NFD')].filter((part) => !/\p{M}/u.test(part)).join('');
      if (base && [...base].every(isWinAnsi)) out += base;
    }
  }
  const result = out.replace(/\s+/g, ' ');
  if (cache.size > 5000) cache.clear();
  cache.set(text, result);
  return result;
}
