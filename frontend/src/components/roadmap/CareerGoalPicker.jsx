import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { goalIcon } from '@/constants/roadmap';
import { cn } from '@/utils/cn';

/**
 * Choose a career goal. Switching never deletes progress: shared milestones stay complete, and the others
 * are kept for if the student switches back. Milestone counts come from the student's branch track.
 */
export function CareerGoalPicker({ open, onClose, goals, currentGoal, templates, saving, onConfirm }) {
  const [choice, setChoice] = useState(currentGoal);
  useEffect(() => {
    if (open) setChoice(currentGoal);
  }, [open, currentGoal]);
  const counts = new Map((templates?.goals ?? []).map((goal) => [goal.id, goal]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Choose your career goal"
      description="Your roadmap adapts to the goal you pick. You can change it any time."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={choice === currentGoal} onClick={() => onConfirm(choice)}>
            {choice === currentGoal ? 'Current goal' : 'Switch goal'}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="sr-only">Career goals</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {goals.map((goal) => {
            const Icon = goalIcon(goal.icon);
            const selected = choice === goal.id;
            const template = counts.get(goal.id);
            return (
              <label
                key={goal.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                  selected ? 'border-primary bg-primary-soft/50 shadow-soft' : 'border-line hover:border-line-strong',
                )}
              >
                <input type="radio" name="career-goal" value={goal.id} checked={selected} onChange={() => setChoice(goal.id)} className="sr-only" />
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl transition-colors', selected ? 'bg-primary text-primary-fg' : 'bg-surface-muted text-ink-muted')}>
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{goal.title}</span>
                    {goal.id === currentGoal && <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-fg">Current</span>}
                    {goal.suggested && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-fg">Suggested</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{goal.tagline}</span>
                  {template && <span className="mt-1 block text-[11px] font-semibold text-ink-subtle">{template.milestones} milestones over 8 semesters</span>}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-muted p-3 text-sm text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Your completed milestones are never deleted. Ones shared by both goals stay complete; the rest are saved and come back if you switch again.
      </p>
    </Modal>
  );
}
