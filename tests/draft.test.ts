import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as model from "../src/shared/draft.ts";
import * as store from "../src/server/store.ts";
const sample = () => ({
  schemaVersion: 1,
  revision: 0,
  route: "/demo.html",
  operations: [
    {
      targetId: "hero-title",
      tag: "h1",
      kind: "text",
      before: "Make room.",
      after: "Make it yours.",
    },
  ],
});

test("validates changes and rejects unsafe styles or oversized text", () => {
  assert.equal(
    typeof model.validateDraft,
    "function",
    "draft validation must exist",
  );
  assert.doesNotThrow(() => model.validateDraft(sample()));
  for (const change of [
    {
      kind: "style",
      property: "backgroundImage",
      before: "",
      after: "url(https://example.com)",
    },
    { kind: "style", property: "padding", before: "0px", after: "-1px" },
    { kind: "text", before: "A", after: "x".repeat(2001) },
  ])
    assert.throws(() =>
      model.validateDraft({
        ...sample(),
        operations: [{ targetId: "hero-title", tag: "h1", ...change }],
      }),
    );
  assert.throws(() =>
    model.validateDraft({ ...sample(), route: "/elsewhere" }),
  );
  assert.throws(() =>
    model.validateDraft({
      ...sample(),
      operations: [...sample().operations, ...sample().operations],
    }),
  );
});

test("serializes revision-checked saves, retains a backup and preserves corrupt data", async () => {
  assert.equal(
    typeof store.saveDraft,
    "function",
    "draft persistence must exist",
  );
  const root = await mkdtemp(join(tmpdir(), "tweakloom-"));
  try {
    assert.equal((await store.readDraft(root)).revision, 0);
    const results = await Promise.allSettled([
      store.saveDraft(root, 0, sample()),
      store.saveDraft(root, 0, sample()),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal((await store.readDraft(root)).revision, 1);
    await store.saveDraft(root, 1, { ...sample(), revision: 1 });
    assert.equal(
      JSON.parse(await readFile(join(root, "draft.backup.json"), "utf8"))
        .revision,
      1,
    );
    await writeFile(join(root, "draft.json"), "broken");
    await assert.rejects(store.readDraft(root), /corrupt/i);
    await assert.rejects(store.saveDraft(root, 2, sample()), /corrupt/i);
    assert.equal(await readFile(join(root, "draft.json"), "utf8"), "broken");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
