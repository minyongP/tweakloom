import {
  mkdir,
  readFile,
  writeFile,
  rename,
  copyFile,
  lstat,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyDraft, validateDraft } from "../shared/draft.ts";
import type { Draft } from "../shared/draft.ts";

const queues = new Map<string, Promise<unknown>>();
export class RevisionConflict extends Error {}
async function safePath(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Symlink draft paths are not allowed");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export async function readDraft(root: string): Promise<Draft> {
  await safePath(root);
  const path = join(root, "draft.json");
  await safePath(path);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDraft();
    throw error;
  }
  try {
    const draft: unknown = JSON.parse(raw);
    validateDraft(draft);
    return draft;
  } catch {
    throw new Error(
      "Saved draft is corrupt. Original file preserved; inspect .tweakloom/draft.json and draft.backup.json.",
    );
  }
}
export async function saveDraft(
  root: string,
  expectedRevision: number,
  value: unknown,
): Promise<Draft> {
  validateDraft(value);
  const draft = structuredClone(value);
  const prior = queues.get(root) ?? Promise.resolve();
  const job = prior
    .catch(() => {})
    .then(async () => {
      const current = await readDraft(root);
      if (
        current.revision !== expectedRevision ||
        draft.revision !== expectedRevision
      )
        throw new RevisionConflict(
          "A newer draft exists. Reload saved draft before saving.",
        );
      await mkdir(root, { recursive: true });
      await safePath(join(root, "draft.backup.json"));
      const next = { ...draft, revision: current.revision + 1 };
      const temp = join(root, `${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(next, null, 2), { flag: "wx" });
      try {
        await copyFile(
          join(root, "draft.json"),
          join(root, "draft.backup.json"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await rename(temp, join(root, "draft.json"));
      return next;
    });
  queues.set(root, job);
  try {
    return await job;
  } finally {
    if (queues.get(root) === job) queues.delete(root);
  }
}
