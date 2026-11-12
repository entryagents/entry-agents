export const ENTRY_PIDS_DIR = "/tmp/entry_pids";
export const ENTRY_PIDS_REGISTRY = "/tmp/entry_pids/registry.json";

export interface RegisteredSandboxProcess {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  startedAt: number;
  logPath: string;
  alive?: boolean;
  statusLine?: string;
  recentLogs?: string;
}

/**
 * Build a POSIX shell script that spawns `command` as a true daemon:
 * - New session (`setsid`) + `nohup` + stdin from `/dev/null` + `disown -a`
 * - Redirects stdout/stderr to `/tmp/entry_pids/<id>.log`
 * - Records PID + metadata in `/tmp/entry_pids/<id>.pid` and `registry.json`
 * - Prints `<pid>` on stdout
 */
export function buildDetachedSpawnScript(
  command: string,
  commandId: string,
  cwd: string,
): string {
  const safeId = commandId.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const logPath = `${ENTRY_PIDS_DIR}/${safeId}.log`;
  const pidPath = `${ENTRY_PIDS_DIR}/${safeId}.pid`;
  const metaPath = `${ENTRY_PIDS_DIR}/${safeId}.meta.json`;
  const metaJson = JSON.stringify({
    id: safeId,
    command,
    cwd,
    startedAt: Date.now(),
    logPath,
  });

  return [
    `mkdir -p ${ENTRY_PIDS_DIR}`,
    `printf '%s' ${JSON.stringify(metaJson)} > ${metaPath}`,
    `setsid nohup bash -c ${JSON.stringify(command)} > ${logPath} 2>&1 < /dev/null &`,
    `EPID=$!`,
    `echo "$EPID" > ${pidPath}`,
    `disown -a 2>/dev/null || true`,
    `echo "$EPID"`,
  ].join("\n");
}

/**
 * Build a shell script that inspects `/tmp/entry_pids/*.meta.json`, checks live
 * `kill -0 <pid>` + `ps` + listening sockets, and optionally tails logs.
 */
export function buildProcessStatusScript(
  processId?: string,
  tailLines = 30,
): string {
  const safeTail = Math.max(1, Math.min(200, Math.floor(tailLines)));
  const targetId = processId ? processId.replace(/[^a-zA-Z0-9_.-]/g, "_") : "";

  return `
mkdir -p ${ENTRY_PIDS_DIR}
TARGET_ID=${JSON.stringify(targetId)}
TAIL_LINES=${safeTail}
echo "=== PROCESSES ==="
for meta in ${ENTRY_PIDS_DIR}/*.meta.json; do
  [ -e "$meta" ] || continue
  base=$(basename "$meta" .meta.json)
  if [ -n "$TARGET_ID" ] && [ "$base" != "$TARGET_ID" ]; then
    continue
  fi
  pidfile="${ENTRY_PIDS_DIR}/$base.pid"
  logfile="${ENTRY_PIDS_DIR}/$base.log"
  pid=""
  [ -f "$pidfile" ] && pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
  alive="false"
  psinfo=""
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    alive="true"
    psinfo=$(ps -p "$pid" -o pid=,ppid=,stat=,etime=,comm= 2>/dev/null | tr -s ' ')
  fi
  echo "---ENTRY_PROC---"
  echo "ID:$base"
  echo "PID:$pid"
  echo "ALIVE:$alive"
  echo "PS:$psinfo"
  echo "META:$(cat "$meta" 2>/dev/null)"
  if [ -n "$TARGET_ID" ] && [ -f "$logfile" ]; then
    echo "LOGS_START"
    tail -n "$TAIL_LINES" "$logfile" 2>/dev/null || true
    echo "LOGS_END"
  elif [ -f "$logfile" ]; then
    echo "LOGS_START"
    tail -n 5 "$logfile" 2>/dev/null || true
    echo "LOGS_END"
  fi
done
echo "=== PORTS ==="
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true) | head -n 30
`.trim();
}

/**
 * Build a shell script that kills a background process group cleanly by
 * processId or numeric PID (SIGTERM -> wait -> SIGKILL) and updates its state.
 */
export function buildKillProcessScript(target: string): string {
  const safeTarget = target.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const isNumericPid = /^\d+$/.test(target.trim());

  if (isNumericPid) {
    const pid = target.trim();
    return `
PID=${pid}
if kill -0 "$PID" 2>/dev/null; then
  PGID=$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$PGID" ] && [ "$PGID" != "0" ] && [ "$PGID" != "1" ]; then
    kill -TERM -"$PGID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
  else
    kill -TERM "$PID" 2>/dev/null || true
  fi
  sleep 0.5
  if kill -0 "$PID" 2>/dev/null; then
    if [ -n "$PGID" ] && [ "$PGID" != "0" ] && [ "$PGID" != "1" ]; then
      kill -KILL -"$PGID" 2>/dev/null || kill -KILL "$PID" 2>/dev/null || true
    else
      kill -KILL "$PID" 2>/dev/null || true
    fi
  fi
  echo "KILLED:$PID"
else
  echo "NOT_RUNNING:$PID"
fi
`.trim();
  }

  return `
PIDFILE="${ENTRY_PIDS_DIR}/${safeTarget}.pid"
if [ ! -f "$PIDFILE" ]; then
  echo "NOT_FOUND:${safeTarget}"
  exit 0
fi
PID=$(cat "$PIDFILE" 2>/dev/null | tr -d '[:space:]')
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  PGID=$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$PGID" ] && [ "$PGID" != "0" ] && [ "$PGID" != "1" ]; then
    kill -TERM -"$PGID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
  else
    kill -TERM "$PID" 2>/dev/null || true
  fi
  sleep 0.5
  if kill -0 "$PID" 2>/dev/null; then
    if [ -n "$PGID" ] && [ "$PGID" != "0" ] && [ "$PGID" != "1" ]; then
      kill -KILL -"$PGID" 2>/dev/null || kill -KILL "$PID" 2>/dev/null || true
    else
      kill -KILL "$PID" 2>/dev/null || true
    fi
  fi
  echo "KILLED:${safeTarget}:$PID"
else
  echo "ALREADY_EXITED:${safeTarget}:$PID"
fi
`.trim();
}
