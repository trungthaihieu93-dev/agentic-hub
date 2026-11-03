import type { AccountDto, TargetDto, TargetId } from '@agentic-hub/shared';
import {
  getActiveId,
  getLiveStatus,
  getTarget,
  listAccounts,
  listUnsaved,
  type Account,
  type CoreDeps,
} from '@agentic-hub/core';

/** Only display fields leave the server: never tokens, fingerprints, identity keys or paths. */
export function toAccountDto(a: Account, activeId: string | null): AccountDto {
  return { id: a.id, target: a.target, label: a.label, email: a.email, orgName: a.orgName, capturedAt: a.capturedAt, isActive: a.id === activeId };
}

export async function targetDto(deps: CoreDeps, id: TargetId): Promise<TargetDto> {
  const t = getTarget(deps, id);
  const enabled = t.enabled();
  const activeId = getActiveId(deps.db, id);
  const accounts = listAccounts(deps, id).map((a) => toAccountDto(a, activeId));
  const live = getLiveStatus(deps.db, id);
  let runningProcesses: TargetDto['runningProcesses'] = [];
  if (enabled.ok) {
    runningProcesses = (await t.runningProcesses()).map((p) => ({
      pid: p.pid,
      name: p.exe ? p.exe.split('/').pop() ?? String(p.pid) : (p.cmdline[0] ?? String(p.pid)),
      cmdline: p.cmdline.join(' ').slice(0, 200),
    }));
  }
  return {
    target: id,
    active: accounts.find((a) => a.isActive) ?? null,
    live: live ? { loggedIn: live.loggedIn, email: live.email, orgName: live.orgName, checkedAt: live.checkedAt } : null,
    drift: live?.drift ?? false,
    accounts,
    unsaved: listUnsaved(deps, id),
    runningProcesses,
    enabled: enabled.ok,
    ...(enabled.ok ? {} : { disabledReason: enabled.reason }),
    ...(t.sharedFiles ? { sharedFiles: t.sharedFiles } : {}),
  };
}
