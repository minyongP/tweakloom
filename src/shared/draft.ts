import { presets, styleFields } from "./catalog.ts";
export type StyleProperty = keyof typeof styleFields;
export const styleProperties = Object.keys(styleFields) as StyleProperty[];
export type Operation = {
  targetId: string;
  tag: string;
  before: string;
  after: string;
} & (
  | { kind: "text" | "options" | "interaction" | "move" }
  | { kind: "style"; property: StyleProperty }
  | { kind: "insert"; parentId: string }
);
export type Interaction =
  | { type: "navigate"; destination: string; newTab: boolean }
  | {
      type: "api";
      method: string;
      url: string;
      headers: string;
      body: string;
      credentialRef: string;
      responseStatus: number;
      response: string;
    };
export type Draft = {
  schemaVersion: 1;
  revision: number;
  route: "/demo.html";
  operations: Operation[];
};
export type ElementInfo = {
  id: string;
  tag: string;
  text: string;
  leaf: boolean;
  styles: Record<StyleProperty, string>;
  container?: boolean;
  parentId?: string;
  nextId?: string | null;
  accepts?: string[];
  options?: string[];
  baseline?: {
    text: string;
    styles: Record<StyleProperty, string>;
    options?: string[];
  };
};
export const emptyDraft = (): Draft => ({
  schemaVersion: 1,
  revision: 0,
  route: "/demo.html",
  operations: [],
});
export const operationKey = (op: Operation) =>
  `${op.targetId}:${op.kind === "style" ? op.property : op.kind}`;
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export type Placement = { parentId: string; beforeId: string | null };
export function parsePlacement(raw: string): Placement {
  const value = JSON.parse(raw);
  if (
    !value ||
    typeof value.parentId !== "string" ||
    !idPattern.test(value.parentId) ||
    (value.beforeId !== null &&
      (typeof value.beforeId !== "string" || !idPattern.test(value.beforeId)))
  )
    throw new Error("Invalid layout placement");
  return value;
}
const px = /^(0|[1-9]\d{0,3})(\.\d{1,2})?px$/;
const signedPx = /^-?(0|[1-9]\d{0,3})(\.\d{1,2})?px$/;
function safeUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1000 ||
    /[\s\\\u0000-\u001f]/.test(value)
  )
    return false;
  if (
    (value.startsWith("/") && !value.startsWith("//")) ||
    value.startsWith("#")
  )
    return true;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function parseInteraction(raw: string): Interaction {
  const value = JSON.parse(raw) as Interaction;
  if (!value || typeof value !== "object") throw new Error("Invalid action");
  if (value.type === "navigate") {
    if (!safeUrl(value.destination) || typeof value.newTab !== "boolean")
      throw new Error("Use a page path, anchor or HTTP(S) URL");
  } else if (value.type === "api") {
    if (
      !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(value.method) ||
      !safeUrl(value.url) ||
      value.url.startsWith("#") ||
      typeof value.headers !== "string" ||
      typeof value.body !== "string" ||
      typeof value.response !== "string" ||
      typeof value.credentialRef !== "string" ||
      !/^[A-Z0-9_]{0,80}$/.test(value.credentialRef) ||
      !Number.isInteger(value.responseStatus) ||
      value.responseStatus < 100 ||
      value.responseStatus > 599
    )
      throw new Error("Invalid API specification");
    const headers = JSON.parse(value.headers);
    if (
      !headers ||
      Array.isArray(headers) ||
      typeof headers !== "object" ||
      Object.entries(headers).some(
        ([key, val]) =>
          !/^[a-zA-Z0-9-]{1,80}$/.test(key) ||
          /^(authorization|cookie|set-cookie|x-api-key)$/i.test(key) ||
          typeof val !== "string" ||
          /[\r\n]/.test(val),
      )
    )
      throw new Error("Use a credentials reference instead of secret headers");
    if (value.body) JSON.parse(value.body);
    if (value.response) JSON.parse(value.response);
  } else throw new Error("Unsupported action");
  return value;
}
export function validateDraft(value: unknown): asserts value is Draft {
  const draft = value as Draft;
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 0 ||
    draft.route !== "/demo.html" ||
    !Array.isArray(draft.operations) ||
    draft.operations.length > 200
  )
    throw new Error("Invalid draft");
  const keys = new Set<string>();
  const inserts = new Map<string, string>();
  for (const op of draft.operations) {
    if (
      !op ||
      typeof op.targetId !== "string" ||
      !idPattern.test(op.targetId) ||
      typeof op.tag !== "string" ||
      !/^[a-z][a-z0-9-]{0,30}$/.test(op.tag) ||
      typeof op.before !== "string" ||
      typeof op.after !== "string" ||
      op.before.length > 12000 ||
      op.after.length > (op.kind === "interaction" ? 12000 : 2000)
    )
      throw new Error("Invalid operation");
    if (op.kind === "style") {
      if (!Object.hasOwn(styleFields, op.property))
        throw new Error("Unsupported style");
      const field = styleFields[op.property];
      if (!field) throw new Error("Unsupported style");
      const valid =
        field.type === "color"
          ? /^#[0-9a-fA-F]{6}$/.test(op.after) || op.after === "transparent"
          : field.type === "select"
            ? (field.options as readonly string[]).includes(op.after)
            : field.type === "number"
              ? /^(0(\.\d{1,2})?|1(\.0{1,2})?)$/.test(op.after)
              : field.type === "translate"
                ? op.after === "none" ||
                  (op.after.split(" ").length === 2 &&
                    op.after.split(" ").every((v) => signedPx.test(v)))
                : field.type === "signed-px"
                  ? signedPx.test(op.after)
                  : px.test(op.after) ||
                    (op.property === "width" &&
                      ["100%", "fit-content"].includes(op.after)) ||
                    (["width", "height", "lineHeight"].includes(op.property) &&
                      op.after ===
                        (op.property === "lineHeight" ? "normal" : "auto"));
      if (!valid) throw new Error("Unsupported style value");
    } else if (op.kind === "insert") {
      if (
        !presets.some(
          (preset) => preset.id === op.after && preset.tag === op.tag,
        ) ||
        !op.targetId.startsWith("draft-") ||
        !idPattern.test(op.parentId) ||
        op.before !== "" ||
        op.targetId === op.parentId
      )
        throw new Error("Invalid component insertion");
      inserts.set(op.targetId, op.parentId);
    } else if (op.kind === "move") {
      const placement = parsePlacement(op.after);
      if (
        placement.parentId === op.targetId ||
        placement.beforeId === op.targetId ||
        (op.before !== "" && !idPattern.test(op.before))
      )
        throw new Error("Invalid component move");
    } else if (op.kind === "interaction") parseInteraction(op.after);
    else if (op.kind === "options") {
      const options = JSON.parse(op.after);
      if (
        op.tag !== "select" ||
        !Array.isArray(options) ||
        !options.length ||
        options.length > 20 ||
        options.some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 80,
        ) ||
        new Set(options).size !== options.length
      )
        throw new Error("Use 1–20 unique dropdown options");
    } else if (op.kind !== "text") throw new Error("Unsupported operation");
    const key = operationKey(op);
    if (keys.has(key)) throw new Error("Duplicate operation");
    keys.add(key);
  }
  for (const start of inserts.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current && inserts.has(current)) {
      if (seen.has(current)) throw new Error("Component insertion cycle");
      seen.add(current);
      current = inserts.get(current);
    }
    if (current?.startsWith("draft-") && current !== "draft-board")
      throw new Error("Missing inserted parent");
  }
}
export function upsertOperation(
  operations: Operation[],
  next: Operation,
): Operation[] {
  const index = operations.findIndex(
    (op) => operationKey(op) === operationKey(next),
  );
  const updated = {
    ...next,
    before: index < 0 ? next.before : operations[index].before,
  } as Operation;
  const result = [...operations];
  if (index >= 0) result.splice(index, 1, updated);
  else result.push(updated);
  const filtered = result.filter(
    (op) => op.kind === "insert" || op.before !== op.after,
  );
  validateDraft({ ...emptyDraft(), operations: filtered });
  return filtered;
}
export function removeOperation(
  operations: Operation[],
  removed: Operation,
): Operation[] {
  const ids = new Set(removed.kind === "insert" ? [removed.targetId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const op of operations)
      if (
        op.kind === "insert" &&
        ids.has(op.parentId) &&
        !ids.has(op.targetId)
      ) {
        ids.add(op.targetId);
        changed = true;
      }
  }
  return operations
    .filter(
      (op) =>
        !ids.has(op.targetId) && operationKey(op) !== operationKey(removed),
    )
    .filter(
      (op) => op.kind !== "move" || !ids.has(parsePlacement(op.after).parentId),
    )
    .map((op) =>
      op.kind === "move" && ids.has(parsePlacement(op.after).beforeId ?? "")
        ? {
            ...op,
            after: JSON.stringify({
              ...parsePlacement(op.after),
              beforeId: null,
            }),
          }
        : op,
    );
}

export function moveOperations(
  operations: Operation[],
  target: {
    id: string;
    tag: string;
    parentId?: string;
    nextId?: string | null;
  },
  placement: Placement,
): Operation[] {
  const previous = operations.find(
    (op) => op.targetId === target.id && op.kind === "move",
  );
  const insertion = operations.find(
    (op) => op.targetId === target.id && op.kind === "insert",
  );
  const next = operations
    .filter(
      (op) =>
        !(
          op.targetId === target.id &&
          (op.kind === "move" ||
            (op.kind === "style" && op.property === "translate"))
        ),
    )
    .map((op) =>
      op.targetId === target.id && op.kind === "insert"
        ? { ...op, parentId: placement.parentId }
        : op,
    )
    .map((op) =>
      op.kind === "move" && parsePlacement(op.after).beforeId === target.id
        ? {
            ...op,
            after: JSON.stringify({
              ...parsePlacement(op.after),
              beforeId: target.nextId ?? null,
            }),
          }
        : op,
    );
  return upsertOperation(next, {
    targetId: target.id,
    tag: target.tag,
    kind: "move",
    before: insertion ? "" : (previous?.before ?? target.parentId ?? ""),
    after: JSON.stringify(placement),
  });
}
