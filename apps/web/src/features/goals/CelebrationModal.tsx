import type { CoreColor, GoalDto } from '@notch/shared';
import { Trophy } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { coreStyle } from '@/lib/core-colors';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Confetti on its own canvas, so it needs no web worker (the CSP has no `worker-src blob:`). */
function useConfetti(active: boolean) {
  useEffect(() => {
    if (!active || window.matchMedia(REDUCED_MOTION).matches) {
      return;
    }
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:60';
    document.body.append(canvas);

    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) {
        return;
      }
      const fire = confetti.create(canvas, {
        resize: true,
        useWorker: false,
        disableForReducedMotion: true,
      });
      void fire({ particleCount: 140, spread: 90, startVelocity: 45, origin: { y: 0.6 } });
    });

    return () => {
      cancelled = true;
      canvas.remove();
    };
  }, [active]);
}

/** Plan 7.5: shown once, when a change completes a goal. */
export function CelebrationModal({
  goal,
  color,
  open,
  onOpenChange,
  onArchive,
  onNewGoal,
}: {
  goal: GoalDto;
  color: CoreColor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  onNewGoal: () => void;
}) {
  useConfetti(open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" style={coreStyle(color)}>
        <DialogHeader className="items-center pt-4 text-center">
          <div className="mb-3 flex size-16 items-center justify-center rounded-full bg-(--core)/15 text-(--core)">
            <Trophy className="size-8" aria-hidden="true" />
          </div>
          <DialogTitle className="text-xl text-balance">Goal done: {goal.title}</DialogTitle>
          <DialogDescription>That's real change, not a checkbox.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" onClick={onArchive}>
            Archive goal
          </Button>
          <Button onClick={onNewGoal}>Set a new goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
