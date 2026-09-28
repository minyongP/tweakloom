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

test("accepts detailed styles, insertion and action specs while rejecting unsafe values", () => {
  const draft = {
    ...sample(),
    operations: [
      {
        targetId: "draft-button",
        tag: "button",
        kind: "insert",
        parentId: "draft-board",
        before: "",
        after: "button",
      },
      {
        targetId: "draft-button",
        tag: "button",
        kind: "style",
        property: "translate",
        before: "none",
        after: "48px -16px",
      },
      {
        targetId: "hero-title",
        tag: "h1",
        kind: "style",
        property: "fontFamily",
        before: "Arial",
        after: "Georgia, serif",
      },
      {
        targetId: "draft-button",
        tag: "button",
        kind: "interaction",
        before: "",
        after: JSON.stringify({
          type: "navigate",
          destination: "/products",
          newTab: false,
        }),
      },
    ],
  };
  assert.doesNotThrow(() => model.validateDraft(draft));
  for (const operation of [
    {
      targetId: "draft-bad",
      tag: "script",
      kind: "insert",
      parentId: "draft-board",
      before: "",
      after: "script",
    },
    {
      targetId: "hero-title",
      tag: "h1",
      kind: "style",
      property: "fontFamily",
      before: "Arial",
      after: "url(https://bad.example/font)",
    },
    {
      targetId: "hero-title",
      tag: "h1",
      kind: "interaction",
      before: "",
      after: JSON.stringify({
        type: "navigate",
        destination: "javascript:alert(1)",
        newTab: false,
      }),
    },
    {
      targetId: "hero-title",
      tag: "h1",
      kind: "style",
      property: "translate",
      before: "none",
      after: "10000000px 0px",
    },
  ])
    assert.throws(() =>
      model.validateDraft({ ...sample(), operations: [operation] }),
    );
  const api = {
    type: "api",
    method: "POST",
    url: "/api/items",
    headers: '{"Content-Type":"application/json"}',
    body: '{"name":"test"}',
    credentialRef: "API_TOKEN",
    responseStatus: 201,
    response: '{"ok":true}',
  };
  const apiDraft = (value: unknown) => ({
    ...sample(),
    operations: [
      {
        targetId: "hero-button",
        tag: "button",
        kind: "interaction",
        before: "",
        after: JSON.stringify(value),
      },
    ],
  });
  assert.doesNotThrow(() => model.validateDraft(apiDraft(api)));
  assert.throws(() =>
    model.validateDraft(apiDraft({ ...api, url: "file:///etc/passwd" })),
  );
  assert.throws(() =>
    model.validateDraft(apiDraft({ ...api, body: "{broken" })),
  );
  assert.throws(() =>
    model.validateDraft(
      apiDraft({ ...api, headers: '{"Authorization":"secret"}' }),
    ),
  );
});

test("rejects inherited style keys and cycles, and removes inserted subtree edits", () => {
  for (const property of ["constructor", "__proto__", "toString"]) {
    assert.throws(() =>
      model.validateDraft({
        ...model.emptyDraft(),
        operations: [
          {
            targetId: "hero-title",
            tag: "h1",
            kind: "style",
            property,
            before: "",
            after: "1px",
          },
        ],
      }),
    );
  }
  const parent: model.Operation = {
    targetId: "draft-parent",
    tag: "div",
    kind: "insert",
    parentId: "draft-board",
    before: "",
    after: "frame",
  };
  const child: model.Operation = {
    targetId: "draft-child",
    tag: "button",
    kind: "insert",
    parentId: "draft-parent",
    before: "",
    after: "button",
  };
  const edit: model.Operation = {
    targetId: "draft-child",
    tag: "button",
    kind: "text",
    before: "Button",
    after: "Go",
  };
  const operations = [parent, child, edit];
  assert.doesNotThrow(() =>
    model.validateDraft({ ...model.emptyDraft(), operations }),
  );
  assert.deepEqual(model.removeOperation(operations, parent), []);
  assert.throws(() =>
    model.validateDraft({
      ...model.emptyDraft(),
      operations: [{ ...parent, parentId: "draft-child" }, child],
    }),
  );
  assert.throws(() =>
    model.validateDraft({ ...model.emptyDraft(), operations: [child] }),
  );
});

test("layout moves are validated, preserve source baselines and clean up removed frames", () => {
  const parent: model.Operation = {
    targetId: "draft-frame",
    tag: "div",
    kind: "insert",
    parentId: "draft-board",
    before: "",
    after: "frame",
  };
  const moved = model.moveOperations(
    [parent],
    { id: "hero-title", tag: "h1", parentId: "hero-content" },
    { parentId: "draft-frame", beforeId: null },
  );
  assert.equal(moved.at(-1)?.before, "hero-content");
  const again = model.moveOperations(
    moved,
    { id: "hero-title", tag: "h1", parentId: "draft-frame" },
    { parentId: "draft-board", beforeId: null },
  );
  assert.equal(again.at(-1)?.before, "hero-content");
  assert.deepEqual(model.removeOperation(moved, parent), []);
  for (const after of [
    "{}",
    '{"parentId":"draft-board","beforeId":4}',
    '{"parentId":"hero-title","beforeId":null}',
  ]) {
    assert.throws(() =>
      model.validateDraft({
        ...model.emptyDraft(),
        operations: [
          {
            targetId: "hero-title",
            tag: "h1",
            kind: "move",
            before: "hero-content",
            after,
          },
        ],
      }),
    );
  }
  assert.throws(() =>
    model.moveOperations(
      [parent],
      { id: "draft-frame", tag: "div", parentId: "draft-board" },
      { parentId: "draft-frame", beforeId: null },
    ),
  );
});
