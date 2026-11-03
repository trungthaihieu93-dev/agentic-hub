import { labelSchema } from '@agentic-hub/shared';
import { ValidationError } from './errors.js';

export { labelSchema };

export function parseLabel(input: string): string {
  const r = labelSchema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Invalid label');
  return r.data;
}
