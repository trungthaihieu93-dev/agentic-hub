import { z } from 'zod';
import { labelSchema } from './labels.js';
import { targetIdSchema } from './targets.js';

export const loginRequestSchema = z.object({ password: z.string().min(1).max(1024) });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const captureRequestSchema = z.object({ target: targetIdSchema, label: labelSchema });
export type CaptureRequest = z.infer<typeof captureRequestSchema>;

export const switchRequestSchema = z.object({
  target: targetIdSchema,
  accountId: z.string().uuid(),
  force: z.boolean().optional(),
  relaunch: z.boolean().optional(),
});
export type SwitchRequest = z.infer<typeof switchRequestSchema>;

const procSchema = z.object({ pid: z.number(), name: z.string(), cmdline: z.string() });

export const accountDtoSchema = z.object({
  id: z.string(),
  target: targetIdSchema,
  label: z.string(),
  email: z.string().nullable(),
  orgName: z.string().nullable(),
  capturedAt: z.string(),
  isActive: z.boolean(),
});
export type AccountDto = z.infer<typeof accountDtoSchema>;

export const versionDtoSchema = z.object({ version: z.string(), capturedAt: z.string() });
export type VersionDto = z.infer<typeof versionDtoSchema>;

export const liveDtoSchema = z.object({
  loggedIn: z.boolean(),
  email: z.string().nullable(),
  orgName: z.string().nullable(),
  checkedAt: z.string(),
});
export type LiveDto = z.infer<typeof liveDtoSchema>;

export const targetDtoSchema = z.object({
  target: targetIdSchema,
  active: accountDtoSchema.nullable(),
  live: liveDtoSchema.nullable(),
  drift: z.boolean(),
  accounts: z.array(accountDtoSchema),
  unsaved: z.array(versionDtoSchema),
  runningProcesses: z.array(procSchema),
  enabled: z.boolean().optional(),
  disabledReason: z.string().optional(),
  /** Desktop targets: files kept the same across every account (MCP config). */
  sharedFiles: z.array(z.string()).optional(),
});
export type TargetDto = z.infer<typeof targetDtoSchema>;

export const accountsResponseSchema = z.object({ targets: z.array(targetDtoSchema) });
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;

export const switchResultSchema = z.object({
  outcome: z.enum(['ok', 'refused', 'rolled_back', 'failed']),
  warnings: z.array(procSchema),
  message: z.string(),
  needsForce: z.boolean(),
  appRunning: z.boolean(),
  unsavedVersion: z.string().optional(),
});

export const auditEntrySchema = z.object({
  id: z.number(),
  target: targetIdSchema,
  fromLabel: z.string().nullable(),
  toLabel: z.string().nullable(),
  actor: z.enum(['cli', 'dashboard', 'recovery']),
  outcome: z.enum(['ok', 'refused', 'rolled_back', 'recovered', 'failed']),
  message: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export const auditResponseSchema = z.object({ entries: z.array(auditEntrySchema) });

export const meResponseSchema = z.object({ authenticated: z.boolean() });
export const healthResponseSchema = z.object({ app: z.literal('ah'), version: z.string() });

export const errorResponseSchema = z.object({ error: z.string(), message: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const emptyAccountRequestSchema = captureRequestSchema;
export type EmptyAccountRequest = CaptureRequest;
