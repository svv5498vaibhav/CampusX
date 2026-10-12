import { useEffect } from 'react';
import { Loader, Modal } from '@/components/ui';
import { formatPoints } from '@/constants/gamification';
import { useGamificationStore } from '@/store/gamificationStore';

const capText = (caps) => {
  if (!caps) return null;
  return [caps.perDay && `${caps.perDay} a day`, caps.perWeek && `${caps.perWeek} a week`, caps.lifetime && `first ${caps.lifetime}`].filter(Boolean).join(', ');
};

/** The exact point rules, caps, levels and tie-breakers, from GET /gamification/rules. */
export function HowPointsWork({ open, onClose }) {
  const rules = useGamificationStore((state) => state.rules);
  const loadRules = useGamificationStore((state) => state.loadRules);
  useEffect(() => {
    if (open) loadRules();
  }, [open, loadRules]);

  return (
    <Modal open={open} onClose={onClose} title="How points work" description="Simple, public rules. No algorithms deciding behind the scenes." size="lg">
      {!rules ? (
        <Loader centered label="Loading the rules" className="min-h-32" />
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <section>
            <h3 className="mb-2 font-semibold text-ink">Earn XP</h3>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {rules.points.map((rule) => (
                <li key={rule.action} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-ink">{rule.label}{capText(rule.caps) && <span className="text-ink-subtle"> · counts {capText(rule.caps)}</span>}</span>
                  <span className="shrink-0 font-bold text-primary">+{rule.points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">Posts count with {rules.quality.postMinLength}+ characters or a photo; comments with {rules.quality.commentMinLength}+ characters. If something stops counting (deleted, made private, unliked), its XP is taken back.</p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-ink">Never rewarded</h3>
            <ul className="list-disc pl-5 text-ink-muted">{rules.notRewarded.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-ink">Levels</h3>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {rules.levels.map((level) => (
                <li key={level.level} className="rounded-xl bg-surface-muted px-2.5 py-1.5">
                  <span className="block text-xs font-bold text-ink">Level {level.level}</span>
                  <span className="block text-[11px] text-ink-muted">{level.name} · {formatPoints(level.minPoints)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 font-semibold text-ink">Ties</h3>
            <p className="text-ink-muted">Same XP? More verified achievements ranks higher, then whoever reached that score first. Weeks start on Monday and months on the 1st ({rules.timezone.replace('_', ' ')} time).</p>
          </section>
        </div>
      )}
    </Modal>
  );
}
