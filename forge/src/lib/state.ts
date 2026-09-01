import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const STATE_DIR = process.env["STATE_DIR"] ?? "/state";

export function statePath(...segments: string[]): string {
  return join(STATE_DIR, ...segments);
}

/**
 * Atomic write: write to a temp file in the same directory, then rename.
 * Readers (the presence service, on the next pipeline run) must never observe
 * a half-written file.
 */
export function writeStateJson(relativePath: string, value: unknown): void {
  const path = statePath(relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, path);
}

export function readStateJson<T>(relativePath: string, schema: z.ZodType<T>): T | null {
  const path = statePath(relativePath);
  try {
    const raw = readFileSync(path, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
