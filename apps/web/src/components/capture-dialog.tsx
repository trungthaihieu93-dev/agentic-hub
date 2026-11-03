import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { labelSchema, TARGET_INFO, type TargetId } from '@agentic-hub/shared';
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
import { errorMessage } from '@/lib/api';
import { useCapture, useCreateEmpty } from '@/lib/queries';

/** `capture` saves the current login; `empty` creates a blank desktop profile. */
export type CaptureMode = 'capture' | 'empty';

interface CaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: TargetId;
  mode: CaptureMode;
}

function validateLabel(value: string): string | null {
  const r = labelSchema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Invalid label');
}

export function CaptureDialog({ open, onOpenChange, target, mode }: CaptureDialogProps) {
  const info = TARGET_INFO[target];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remounted on every open so the form starts empty. */}
        {open && <CaptureForm target={target} mode={mode} appName={info.displayName} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CaptureForm({
  target,
  mode,
  appName,
  onDone,
}: {
  target: TargetId;
  mode: CaptureMode;
  appName: string;
  onDone: () => void;
}) {
  const [label, setLabel] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const capture = useCapture();
  const createEmpty = useCreateEmpty();
  const pending = capture.isPending || createEmpty.isPending;
  const inputId = useId();
  const errorId = useId();
  const validation = touched ? validateLabel(label) : null;
  const error = validation ?? serverError;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (validateLabel(label)) return;
    const vars = { target, label };
    const onError = (err: unknown) => setServerError(errorMessage(err));
    if (mode === 'capture') {
      capture.mutate(vars, {
        onSuccess: (res) => {
          toast.success(res.created ? `Saved account "${res.account.label}"` : `Updated account "${res.account.label}"`, {
            description: res.note,
          });
          onDone();
        },
        onError,
      });
    } else {
      createEmpty.mutate(vars, {
        onSuccess: (res) => {
          toast.success(`Created empty profile "${res.account.label}"`, {
            description: `Switch to it, then sign in inside ${appName}.`,
          });
          onDone();
        },
        onError,
      });
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{mode === 'capture' ? 'Capture current login' : 'Add empty account'}</DialogTitle>
        <DialogDescription>
          {mode === 'capture'
            ? `Save the account ${appName} is signed in to right now under a name you choose.`
            : `Create a blank ${appName} profile. Switch to it, then sign in inside the app.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>Account label</Label>
        <Input
          id={inputId}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setServerError(null);
          }}
          onBlur={() => label && setTouched(true)}
          placeholder="e.g. work, personal"
          maxLength={40}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode === 'capture' ? 'Capture' : 'Create profile'}
        </Button>
      </DialogFooter>
    </form>
  );
}
