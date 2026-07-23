/**
 * Lightweight per-request timing for /v1/messages without logging prompts.
 */

export interface RequestMetrics {
  requestId: string;
  upstreamMode: "cli";
  streaming: boolean;
  receivedAtMs: number;
  spawnStartedAtMs: number | null;
  spawnReadyAtMs: number | null;
  firstStdoutAtMs: number | null;
  firstDeltaAtMs: number | null;
  completedAtMs: number | null;
  resumeChatId: string | null;
}

const recentMetrics: RequestMetrics[] = [];
const MAX_RECENT = 50;

export function startRequestMetrics(
  requestId: string,
  upstreamMode: RequestMetrics["upstreamMode"],
  streaming: boolean,
  resumeChatId: string | null = null
): RequestMetrics {
  const metrics: RequestMetrics = {
    requestId,
    upstreamMode,
    streaming,
    receivedAtMs: Date.now(),
    spawnStartedAtMs: null,
    spawnReadyAtMs: null,
    firstStdoutAtMs: null,
    firstDeltaAtMs: null,
    completedAtMs: null,
    resumeChatId,
  };
  recentMetrics.unshift(metrics);
  if (recentMetrics.length > MAX_RECENT) {
    recentMetrics.length = MAX_RECENT;
  }
  return metrics;
}

export function markSpawnStarted(metrics: RequestMetrics): void {
  if (metrics.spawnStartedAtMs === null) {
    metrics.spawnStartedAtMs = Date.now();
  }
}

export function markSpawnReady(metrics: RequestMetrics): void {
  if (metrics.spawnReadyAtMs === null) {
    metrics.spawnReadyAtMs = Date.now();
  }
}

export function markFirstStdout(metrics: RequestMetrics): void {
  if (metrics.firstStdoutAtMs === null) {
    metrics.firstStdoutAtMs = Date.now();
  }
}

export function markFirstDelta(metrics: RequestMetrics): void {
  if (metrics.firstDeltaAtMs === null) {
    metrics.firstDeltaAtMs = Date.now();
  }
}

export function markCompleted(metrics: RequestMetrics): void {
  metrics.completedAtMs = Date.now();
}

export function getRecentMetrics(): RequestMetrics[] {
  return [...recentMetrics];
}

function deltaFrom(start: number | null, end: number | null): number | null {
  if (start === null || end === null) {
    return null;
  }
  return end - start;
}

export function summarizeMetrics(items: RequestMetrics[] = recentMetrics): {
  count: number;
  p50FirstDeltaMs: number | null;
  p95FirstDeltaMs: number | null;
  p50SpawnReadyMs: number | null;
  p50SpawnToStdoutMs: number | null;
} {
  const firstDeltas = items
    .map((item) => deltaFrom(item.receivedAtMs, item.firstDeltaAtMs))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const spawnReady = items
    .map((item) => deltaFrom(item.spawnStartedAtMs, item.spawnReadyAtMs))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const spawnToStdout = items
    .map((item) => deltaFrom(item.spawnStartedAtMs, item.firstStdoutAtMs))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const percentile = (values: number[], p: number): number | null => {
    if (values.length === 0) {
      return null;
    }
    const index = Math.min(
      values.length - 1,
      Math.max(0, Math.ceil((p / 100) * values.length) - 1)
    );
    return values[index] ?? values[values.length - 1] ?? null;
  };

  return {
    count: firstDeltas.length,
    p50FirstDeltaMs: percentile(firstDeltas, 50),
    p95FirstDeltaMs: percentile(firstDeltas, 95),
    p50SpawnReadyMs: percentile(spawnReady, 50),
    p50SpawnToStdoutMs: percentile(spawnToStdout, 50),
  };
}

export function metricsHeaders(metrics: RequestMetrics): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Cursor-Upstream-Mode": metrics.upstreamMode,
  };

  if (metrics.resumeChatId) {
    headers["X-Cursor-Resume-Chat-Id"] = metrics.resumeChatId;
  }

  const spawnReady = deltaFrom(metrics.spawnStartedAtMs, metrics.spawnReadyAtMs);
  if (spawnReady !== null) {
    headers["X-Cursor-Spawn-Ready-Ms"] = String(spawnReady);
  }

  const spawnToStdout = deltaFrom(metrics.spawnStartedAtMs, metrics.firstStdoutAtMs);
  if (spawnToStdout !== null) {
    headers["X-Cursor-Spawn-To-Stdout-Ms"] = String(spawnToStdout);
  }

  if (metrics.firstDeltaAtMs !== null) {
    headers["X-Cursor-First-Delta-Ms"] = String(
      metrics.firstDeltaAtMs - metrics.receivedAtMs
    );
  }
  if (metrics.completedAtMs !== null) {
    headers["X-Cursor-Total-Ms"] = String(
      metrics.completedAtMs - metrics.receivedAtMs
    );
  }
  return headers;
}
