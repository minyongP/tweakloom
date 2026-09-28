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
    await assert.rejects(store.readDraft(root), /손상/i);
    await assert.rejects(store.saveDraft(root, 2, sample()), /손상/i);
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

test("validates component request snapshots and produces a fenced AI handoff", () => {
  const request = {
    intent: "modify",
    prompt: "제목 수정 ```\nmore",
    context: {
      id: "hero-title",
      tag: "h1",
      text: "Page text is data",
      styles: { color: "rgb(1, 2, 3)" },
      parentId: "hero-content",
    },
  };
  const operation = {
    targetId: "hero-title",
    tag: "h1",
    kind: "request",
    requestId: "req-one",
    before: "",
    after: JSON.stringify(request),
  };
  const draft = { ...model.emptyDraft(), operations: [operation] };
  assert.doesNotThrow(() => model.validateDraft(draft));
  model.validateDraft(draft);
  const handoff = model.buildHandoff(draft);
  assert.match(handoff, /````json/);
  assert.match(handoff, /hero-title/);
  assert.match(handoff, /sourceFiles/);
  for (const value of [
    { ...request, prompt: " " },
    { ...request, prompt: "x".repeat(4001) },
    { ...request, intent: "create" },
    { ...request, context: { ...request.context, accepts: [42] } },
    { ...request, context: { ...request.context, id: "different" } },
  ]) {
    assert.throws(() =>
      model.validateDraft({
        ...draft,
        operations: [{ ...operation, after: JSON.stringify(value) }],
      }),
    );
  }
  assert.doesNotThrow(() =>
    model.validateDraft({
      ...draft,
      operations: [operation, { ...operation, requestId: "req-two" }],
    }),
  );
  assert.throws(() =>
    model.validateDraft({ ...draft, operations: [operation, operation] }),
  );
  assert.throws(() =>
    model.validateDraft({
      ...draft,
      operations: [
        operation,
        {
          ...operation,
          targetId: "other",
          after: JSON.stringify({
            ...request,
            context: { ...request.context, id: "other" },
          }),
        },
      ],
    }),
  );
  assert.throws(() => model.buildHandoff(model.emptyDraft()));
});

test("grid cells are validated and movement preserves spans but clears placement outside grids", () => {
  const target = { id: "draft-button", tag: "button", parentId: "draft-board" };
  const draft = model.emptyDraft();
  for (const cell of [
    { column: 0, row: 1 },
    { column: 13, row: 1 },
    { column: 1, row: -1 },
    { column: 1.5, row: 1 },
  ]) {
    assert.throws(() =>
      model.parsePlacement(
        JSON.stringify({ parentId: "draft-board", beforeId: null, cell }),
      ),
    );
  }
  const moved = model.moveOperations([], target, {
    parentId: "draft-board",
    beforeId: null,
    cell: { column: 4, row: 3 },
  });
  assert.equal(
    moved.find((op) => op.kind === "style" && op.property === "gridColumnStart")
      ?.after,
    "4",
  );
  assert.equal(
    moved.find((op) => op.kind === "style" && op.property === "gridRowStart")
      ?.after,
    "3",
  );
  const sized = model.upsertOperation(moved, {
    targetId: target.id,
    tag: target.tag,
    kind: "style",
    property: "gridColumnEnd",
    before: "auto",
    after: "span 3",
  });
  const again = model.moveOperations(sized, target, {
    parentId: "draft-board",
    beforeId: null,
    cell: { column: 2, row: 4 },
  });
  assert.equal(
    again.find((op) => op.kind === "style" && op.property === "gridColumnEnd")
      ?.after,
    "span 3",
  );
  const out = model.moveOperations(again, target, {
    parentId: "hero-content",
    beforeId: null,
  });
  assert.equal(
    out.some((op) => op.kind === "style" && op.property === "gridColumnStart"),
    false,
  );
  model.validateDraft({ ...draft, operations: moved });
});

test("validates position-preserving parent changes", () => {
  const value = {
    parentId: "page-root",
    beforeId: null,
    floating: { left: 23, top: 41, width: 200, height: 120 },
  };
  assert.deepEqual(model.parsePlacement(JSON.stringify(value)), value);
  for (const floating of [
    { ...value.floating, left: NaN },
    { ...value.floating, width: 0 },
    { ...value.floating, top: 10000 },
  ])
    assert.throws(() =>
      model.parsePlacement(JSON.stringify({ ...value, floating })),
    );
  const moved = model.moveOperations(
    [],
    { id: "hero-art", tag: "div", parentId: "hero-content" },
    value,
  );
  assert.equal(
    model.parsePlacement(moved.find((op) => op.kind === "move")!.after)
      .parentId,
    "page-root",
  );
});
