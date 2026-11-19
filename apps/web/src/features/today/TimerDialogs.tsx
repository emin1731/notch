import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDuration } from '@/lib/habit-format';
import { type TimerPrompt, useTimerActions, useTimerPrompt } from './timer-actions';
import { weekdayName } from './today-model';

/** The timer's questions (plan 7.4). Rendered once, in the app shell. */
export function TimerDialogs() {
  const prompt = useTimerPrompt((state) => state.prompt);
  const actions = useTimerActions();

  if (prompt?.kind === 'switch') {
    return (
      <Dialog open onOpenChange={(open) => !open && actions.dismiss()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>One timer at a time</DialogTitle>
            <DialogDescription>
              Stop {prompt.current.habitName} and start {prompt.next.habitName}? The time so far is
              logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={actions.dismiss}>
              Keep {prompt.current.habitName}
            </Button>
            <Button onClick={() => actions.switchTimers(prompt)}>Switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  if (prompt) {
    // Keyed so the minutes field starts from this prompt's time.
    return <TimeDialog key={prompt.timer.startedAt} prompt={prompt} actions={actions} />;
  }
  return null;
}

function TimeDialog({
  prompt,
  actions,
}: {
  prompt: Exclude<TimerPrompt, { kind: 'switch' }>;
  actions: ReturnType<typeof useTimerActions>;
}) {
  const [minutes, setMinutes] = useState(String(Math.round(prompt.seconds / 60)));
  const id = useId();
  const value = Number(minutes);
  const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 24 * 60;
  const outside = prompt.kind === 'outside-window';
  const date = outside ? actions.today() : prompt.timer.date;

  return (
    <Dialog open onOpenChange={(open) => !open && actions.dismiss()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{outside ? 'That day has passed' : 'Still going?'}</DialogTitle>
          <DialogDescription>
            {outside
              ? `${prompt.timer.habitName} has been running since ${weekdayName(prompt.timer.date)}, too long ago to log there. Log the time to today, or discard it.`
              : `${prompt.timer.habitName} has been running for ${formatDuration(prompt.seconds)}. Log it, or fix the time first.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>Minutes to log</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            max={24 * 60}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            aria-invalid={!valid || undefined}
          />
        </div>
        <DialogFooter>
          {outside ? (
            <Button variant="outline" onClick={() => actions.discard(prompt)}>
              Discard
            </Button>
          ) : (
            <Button variant="outline" onClick={actions.dismiss}>
              Keep going
            </Button>
          )}
          <Button disabled={!valid} onClick={() => actions.logPrompted(prompt, value * 60, date)}>
            {outside ? 'Log to today' : 'Log it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
