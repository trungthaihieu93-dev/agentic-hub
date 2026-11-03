import { readFileSync, readdirSync, readlinkSync } from 'node:fs';

export interface ProcInfo {
  pid: number;
  /** Real path of the executable, or null when it cannot be read (other users, kernel threads). */
  exe: string | null;
  cmdline: string[];
}

export interface ProcIdentity {
  /** Field 22 of /proc/<pid>/stat: start time in clock ticks since boot. */
  startTime: string;
  bootId: string;
  cmdline: string;
}

let cachedBootId: string | null = null;
export function readBootId(): string {
  cachedBootId ??= readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  return cachedBootId;
}

export function readStartTime(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // The command name can contain spaces and parentheses, so split after the last ')'.
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return rest[19] ?? null; // rest[0] is field 3, so field 22 is rest[19]
  } catch {
    return null;
  }
}

function readCmdline(pid: number): string[] {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

function readExe(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '');
  } catch {
    return null;
  }
}

export function procIdentity(pid: number): ProcIdentity | null {
  const startTime = readStartTime(pid);
  if (startTime === null) return null;
  return { startTime, bootId: readBootId(), cmdline: readCmdline(pid).join(' ') };
}

export function procInfo(pid: number): ProcInfo | null {
  const cmdline = readCmdline(pid);
  const exe = readExe(pid);
  if (cmdline.length === 0 && exe === null) return null;
  return { pid, exe, cmdline };
}

/** Every process visible in /proc except this one. */
export function listProcesses(): ProcInfo[] {
  const out: ProcInfo[] = [];
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    if (pid === process.pid) continue;
    const info = procInfo(pid);
    if (info) out.push(info);
  }
  return out;
}

/** Paths that any process has open (fds) or uses as its working directory. */
export function procOpenPaths(pid: number): string[] {
  const out: string[] = [];
  try {
    out.push(readlinkSync(`/proc/${pid}/cwd`));
  } catch {
    /* not ours */
  }
  try {
    for (const fd of readdirSync(`/proc/${pid}/fd`)) {
      try {
        out.push(readlinkSync(`/proc/${pid}/fd/${fd}`));
      } catch {
        /* closed meanwhile */
      }
    }
  } catch {
    /* not ours */
  }
  return out;
}
