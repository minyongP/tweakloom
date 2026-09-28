export const styleProperties = [
  "color",
  "backgroundColor",
  "padding",
  "borderRadius",
  "fontSize",
  "width",
] as const;
export type StyleProperty = (typeof styleProperties)[number];
export type Operation = {
  targetId: string;
  tag: string;
  before: string;
  after: string;
} & ({ kind: "text" } | { kind: "style"; property: StyleProperty });
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
  baseline?: { text: string; styles: Record<StyleProperty, string> };
};
export const emptyDraft = (): Draft => ({
  schemaVersion: 1,
  revision: 0,
  route: "/demo.html",
  operations: [],
});
export const operationKey = (op: Operation) =>
  `${op.targetId}:${op.kind === "text" ? "text" : op.property}`;

export function validateDraft(value: unknown): asserts value is Draft {
  const d = value as Draft;
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    d.route !== "/demo.html" ||
    !Array.isArray(d.operations) ||
    d.operations.length > 200
  )
    throw new Error("Invalid draft");
  const keys = new Set<string>();
  for (const op of d.operations) {
    if (
      !op ||
      typeof op.targetId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(op.targetId) ||
      typeof op.tag !== "string" ||
      !/^[a-z][a-z0-9-]{0,30}$/.test(op.tag) ||
      typeof op.before !== "string" ||
      typeof op.after !== "string" ||
      op.before.length > 2000 ||
      op.after.length > 2000
    )
      throw new Error("Invalid operation");
    if (op.kind === "style") {
      if (!styleProperties.includes(op.property))
        throw new Error("Unsupported style");
      const valid =
        op.property === "color" || op.property === "backgroundColor"
          ? /^#[0-9a-fA-F]{6}$/.test(op.after)
          : /^(0|[1-9]\d{0,3})px$/.test(op.after) ||
            (op.property === "width" && op.after === "auto");
      if (!valid) throw new Error("Unsupported style value");
    } else if (op.kind !== "text") throw new Error("Unsupported operation");
    const key = operationKey(op);
    if (keys.has(key)) throw new Error("Duplicate operation");
    keys.add(key);
  }
}

export function upsertOperation(
  operations: Operation[],
  next: Operation,
): Operation[] {
  const key = operationKey(next);
  const prior = operations.find((op) => operationKey(op) === key);
  const updated = {
    ...next,
    before: prior?.before ?? next.before,
  } as Operation;
  const result = operations.filter((op) => operationKey(op) !== key);
  if (updated.before !== updated.after) result.push(updated);
  validateDraft({ ...emptyDraft(), operations: result });
  return result;
}
