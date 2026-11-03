import { z } from 'zod';

/** Account label: 1-40 word characters, spaces, dots or dashes, never starting with a dot. */
export const labelSchema = z
  .string()
  .regex(/^[\w .-]{1,40}$/, 'Use 1-40 letters, digits, spaces, dots, dashes or underscores')
  .refine((v) => !v.startsWith('.'), 'A label cannot start with a dot')
  .refine((v) => v.trim().length > 0, 'A label cannot be blank');
