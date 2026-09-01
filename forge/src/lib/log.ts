export function log(scope: string, message: string): void {
  console.log(`[${scope}] ${message}`);
}

export function logError(scope: string, message: string, cause?: unknown): void {
  const suffix = cause instanceof Error ? `: ${cause.message}` : cause !== undefined ? `: ${String(cause)}` : "";
  console.error(`[${scope}] ${message}${suffix}`);
}
