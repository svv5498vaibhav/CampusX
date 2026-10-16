import { memo } from 'react';
import { CSS_FONTS } from '@/utils/resume/fonts';
import { A4 } from '@/utils/resume/layout';

const isSafeUrl = (url) => /^(https?:|mailto:)/i.test(url ?? '');

/**
 * Draws one laid-out resume page as SVG: the same operations, in the same positions, that the PDF writer
 * uses (utils/resume/pdf.js), so the preview is the document. Each text run is stretched to the width the
 * layout measured (textLength), so a slightly different system font can't shift line breaks or overlap.
 * The page is always white paper, whatever the app theme.
 */
function renderOp(op, key) {
  switch (op.t) {
    case 'text': {
      // The measured width includes the PDF's character spacing after the last letter, which is never seen.
      const length = op.text.length > 1 && op.w > 0 ? op.w - (op.cs || 0) : undefined;
      return (
        <text
          key={key}
          x={op.x}
          y={op.y}
          fontFamily={CSS_FONTS[op.font]}
          fontSize={op.size}
          fontWeight={op.style.includes('bold') ? 700 : 400}
          fontStyle={op.style.includes('italic') ? 'italic' : 'normal'}
          fill={op.color}
          textLength={length}
          lengthAdjust="spacing"
          xmlSpace="preserve"
          style={{ fontKerning: 'none' }}
        >
          {op.text}
        </text>
      );
    }
    case 'rect': {
      const radius = Math.min(op.r ?? 0, op.w / 2, op.h / 2);
      return <rect key={key} x={op.x} y={op.y} width={op.w} height={op.h} rx={radius || undefined} fill={op.fill ?? 'none'} stroke={op.stroke ?? undefined} strokeWidth={op.stroke ? (op.lw ?? 0.6) : undefined} />;
    }
    case 'line':
      return <line key={key} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} stroke={op.color} strokeWidth={op.lw} />;
    case 'circle':
      return <circle key={key} cx={op.x} cy={op.y} r={op.r} fill={op.fill} />;
    case 'link':
      return isSafeUrl(op.url) ? (
        <a key={key} href={op.url} target="_blank" rel="noopener noreferrer">
          <rect x={op.x} y={op.y} width={op.w} height={op.h} fill="transparent" />
        </a>
      ) : null;
    default:
      return null;
  }
}

export const ResumePage = memo(function ResumePage({ page, label, className }) {
  return (
    <svg viewBox={`0 0 ${A4.width} ${A4.height}`} className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMin meet">
      <rect width={A4.width} height={A4.height} fill="#ffffff" />
      {page.bg.map((op, index) => renderOp(op, `b${index}`))}
      {page.fg.map((op, index) => renderOp(op, `f${index}`))}
    </svg>
  );
});
