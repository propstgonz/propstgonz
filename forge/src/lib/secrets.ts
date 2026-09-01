import { readFileSync } from "node:fs";

/**
 * Secrets are files, never environment values. The precedence is
 * <NAME>_FILE -> /run/secrets/<name>. There is deliberately no inline fallback:
 * an inline value would show up in `docker inspect` and in crash dumps.
 */
export function readSecret(name: string): string {
  const fromEnvPath = process.env[`${name.toUpperCase()}_FILE`];
  const candidates = [fromEnvPath, `/run/secrets/${name}`].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  for (const path of candidates) {
    try {
      const value = readFileSync(path, "utf8").trim();
      if (value.length > 0) return value;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `secret "${name}" not found; looked in ${candidates.join(", ")}. ` +
      `Provide it via docker compose secrets, never via environment.`,
  );
}
