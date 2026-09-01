import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "./log.js";

const run = promisify(execFile);

// ssh-agent is set up by the entrypoint; SSH_AUTH_SOCK is inherited.
// Host keys are pinned in the image: StrictHostKeyChecking stays on.
const SSH_COMMAND =
  "ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/ssh/known_hosts.github";

export async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await run("git", args, {
      cwd,
      env: { ...process.env, GIT_SSH_COMMAND: SSH_COMMAND, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (cause) {
    throw new Error(`git ${args.join(" ")} failed${cwd ? ` in ${cwd}` : ""}`, { cause });
  }
}

export async function verifySshAccess(): Promise<void> {
  // GitHub always exits 1 on `ssh -T`; success is identified by the greeting text.
  const out = await run("ssh", ["-T", "-o", "StrictHostKeyChecking=yes",
    "-o", "UserKnownHostsFile=/etc/ssh/known_hosts.github", "git@github.com"], {
    env: process.env,
  }).then(
    (r) => `${r.stdout}${r.stderr}`,
    (e: { stdout?: string; stderr?: string }) => `${e.stdout ?? ""}${e.stderr ?? ""}`,
  );
  if (!out.includes("successfully authenticated")) {
    throw new Error(`SSH authentication to github.com failed: ${out.trim()}`);
  }
  log("git", "ssh authentication ok");
}
