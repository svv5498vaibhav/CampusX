import { jsPDF } from 'jspdf';

/**
 * Text measurement for the resume layout, from the same font metrics jsPDF uses to write the PDF, so line
 * breaks in the preview and in the downloaded PDF are identical. Kerning is off on purpose: jsPDF draws
 * standard-font text without kerning, and the preview is told to do the same.
 *
 * Fonts: 'helvetica' | 'times' | 'courier'; styles: 'normal' | 'bold' | 'italic' | 'bolditalic'.
 */

let measurer = null;
const cache = new Map();

function unitWidth(text, font, style) {
  const key = `${font}|${style}|${text}`;
  let width = cache.get(key);
  if (width === undefined) {
    measurer ??= new jsPDF({ unit: 'pt', format: 'a4' });
    measurer.setFont(font, style);
    width = measurer.getStringUnitWidth(text, { doKerning: false });
    if (cache.size > 40000) cache.clear();
    cache.set(key, width);
  }
  return width;
}

/** Width in points of `text` set in `style` ({ font, style, size, cs }). `cs` is extra space after each character. */
export const textWidth = (text, style) => unitWidth(text, style.font, style.style ?? 'normal') * style.size + (style.cs ?? 0) * text.length;

/** CSS font stacks for the preview: each standard PDF font, then its metric-compatible stand-ins. */
export const CSS_FONTS = {
  helvetica: "Helvetica, Arial, 'Liberation Sans', 'Nimbus Sans', sans-serif",
  times: "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', serif",
  courier: "'Courier New', Courier, 'Liberation Mono', 'Nimbus Mono PS', monospace",
};
