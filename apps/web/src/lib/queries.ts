import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SwitchRequest, TargetId } from '@agentic-hub/shared';
import { api } from './api';

export const queryKeys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  audit: ['audit'] as const,
};

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me, retry: false });
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: api.accounts });
}

export function useAudit() {
  return useQuery({ queryKey: queryKeys.audit, queryFn: () => api.audit(50) });
}

/** Every account mutation refreshes the board and the audit log, success or not. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.accounts }),
      qc.invalidateQueries({ queryKey: queryKeys.audit }),
    ]);
}

export function useCapture() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { target: TargetId; label: string }) => api.capture(v.target, v.label),
    onSettled: invalidate,
  });
}

export function useCreateEmpty() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { target: TargetId; label: string }) => api.createEmpty(v.target, v.label),
    onSettled: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.deleteAccount(id), onSettled: invalidate });
}

export function useDeleteUnsaved() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (v: { target: TargetId; version: string }) => api.deleteUnsaved(v.target, v.version),
    onSettled: invalidate,
  });
}

export function useSwitch() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (req: SwitchRequest) => api.switchAccount(req), onSettled: invalidate });
}
