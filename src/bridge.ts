import { presets } from "./shared/catalog.ts";
import {
  emptyDraft,
  operationKey,
  styleProperties,
  validateDraft,
  parseInteraction,
} from "./shared/draft.ts";
import type { Draft, ElementInfo, Operation } from "./shared/draft.ts";
import { createPreset } from "./presets.ts";

const channel = new URLSearchParams(location.hash.slice(1)).get("tweakloom");
if (channel && /^[a-f0-9-]{36}$/.test(channel) && window.parent !== window)
  start(channel);

function start(channel: string) {
  let draft: Draft = emptyDraft();
  let selected: string | null = null;
  let initialized = false,
    pending = false,
    editable = true,
    simulate = false,
    snap = false;
  let lastReport = "",
    suppressClickUntil = 0;
  const inserted = new Set<HTMLElement>();
  const active = new Map<
    string,
    {
      element: HTMLElement;
      operation: Operation;
      original: string;
      applied: string;
    }
  >();
  let baselines = new Map<HTMLElement, ElementInfo>();
  let drag: {
    element: HTMLElement;
    pointer: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    inline: string;
    before: string;
    moved: boolean;
  } | null = null;
  const send = (message: object) =>
    parent.postMessage({ channel, ...message }, location.origin);
  const candidates = (id: string) =>
    [...document.querySelectorAll<HTMLElement>("[data-tweakloom-id]")].filter(
      (el) => el.dataset.tweakloomId === id,
    );
  const options = (el: HTMLElement) =>
    el instanceof HTMLSelectElement
      ? [...el.options].map((option) => option.text)
      : undefined;
  const read = (el: HTMLElement, op: Operation) =>
    op.kind === "text"
      ? (el.textContent ?? "")
      : op.kind === "options"
        ? JSON.stringify(options(el))
        : op.kind === "style"
          ? getComputedStyle(el)[op.property]
          : "";
  function write(el: HTMLElement, op: Operation, value: string) {
    if (op.kind === "text") el.textContent = value;
    else if (op.kind === "style") el.style[op.property] = value;
    else if (op.kind === "options" && el instanceof HTMLSelectElement)
      el.replaceChildren(
        ...(JSON.parse(value) as string[]).map(
          (label) => new Option(label, label),
        ),
      );
  }
  const info = (el: HTMLElement): ElementInfo => ({
    id: el.dataset.tweakloomId!,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").slice(0, 2000),
    leaf:
      el.children.length === 0 &&
      !["input", "hr", "select"].includes(el.tagName.toLowerCase()),
    container: el.hasAttribute("data-tweakloom-container"),
    parentId: el.parentElement?.closest<HTMLElement>(
      "[data-tweakloom-container]",
    )?.dataset.tweakloomId,
    options: options(el),
    styles: Object.fromEntries(
      styleProperties.map((key) => [key, getComputedStyle(el)[key]]),
    ) as ElementInfo["styles"],
  });
  const observe = () =>
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  const observer = new MutationObserver(() => {
    if (!pending && initialized && !drag) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!drag) reconcile();
      });
    }
  });
  function restore() {
    for (const previous of active.values())
      if (
        previous.element.isConnected &&
        read(previous.element, previous.operation) === previous.applied
      )
        write(previous.element, previous.operation, previous.original);
    active.clear();
  }
  function reconcile() {
    observer.disconnect();
    restore();
    for (const element of inserted) element.remove();
    inserted.clear();
    const conflicts: string[] = [];
    const remaining = draft.operations.filter((op) => op.kind === "insert");
    // Parents may appear later after an import; bounded topological replay.
    for (
      let pass = 0, limit = remaining.length;
      pass < limit && remaining.length;
      pass++
    ) {
      let progress = false;
      for (let i = 0; i < remaining.length; i++) {
        const op = remaining[i];
        if (op.kind !== "insert") continue;
        const parents = candidates(op.parentId);
        if (
          parents.length !== 1 ||
          !parents[0].hasAttribute("data-tweakloom-container")
        )
          continue;
        if (candidates(op.targetId).length) {
          conflicts.push(`${op.targetId}: ambiguous inserted target`);
          remaining.splice(i--, 1);
          continue;
        }
        const element = createPreset(op.after);
        element.dataset.tweakloomId = op.targetId;
        parents[0].append(element);
        inserted.add(element);
        remaining.splice(i--, 1);
        progress = true;
      }
      if (!progress) break;
    }
    for (const op of remaining)
      conflicts.push(
        `${op.targetId}: missing or ambiguous insertion container`,
      );
    baselines = new Map(
      [...document.querySelectorAll<HTMLElement>("[data-tweakloom-id]")].map(
        (el) => [el, info(el)],
      ),
    );
    for (const op of draft.operations) {
      if (op.kind === "insert") continue;
      const matches = candidates(op.targetId);
      if (matches.length !== 1) {
        conflicts.push(
          `${op.targetId}: ${matches.length ? "ambiguous target" : "missing target"}`,
        );
        continue;
      }
      const el = matches[0];
      if (
        el.tagName.toLowerCase() !== op.tag ||
        (op.kind === "text" && !info(el).leaf)
      ) {
        conflicts.push(`${op.targetId}: structure changed in the app`);
        continue;
      }
      if (op.kind === "interaction") continue;
      const baseline = baselines.get(el)!;
      const current =
        op.kind === "text"
          ? baseline.text
          : op.kind === "options"
            ? JSON.stringify(baseline.options)
            : op.kind === "style"
              ? baseline.styles[op.property]
              : "";
      if (current !== op.before) {
        conflicts.push(`${op.targetId}: value changed in the app`);
        continue;
      }
      const original = op.kind === "style" ? el.style[op.property] : current;
      write(el, op, op.after);
      active.set(operationKey(op), {
        element: el,
        operation: op,
        original,
        applied: read(el, op),
      });
    }
    for (const el of document.querySelectorAll("[data-tweakloom-selected]"))
      el.removeAttribute("data-tweakloom-selected");
    const matches = selected ? candidates(selected) : [];
    const chosen = matches.length === 1 ? matches[0] : null;
    chosen?.setAttribute("data-tweakloom-selected", "");
    document.documentElement.dataset.tweakloomMode = simulate
      ? "preview"
      : "edit";
    const report = {
      type: "state",
      elements: [
        ...document.querySelectorAll<HTMLElement>("[data-tweakloom-id]"),
      ].map(info),
      selected: chosen
        ? { ...info(chosen), baseline: baselines.get(chosen) }
        : null,
      conflicts,
    };
    const serialized = JSON.stringify(report);
    if (serialized !== lastReport) {
      send(report);
      lastReport = serialized;
    }
    observe();
  }
  function testAction(id: string) {
    const operation = draft.operations.find(
      (op) => op.targetId === id && op.kind === "interaction",
    );
    if (!operation) {
      send({
        type: "simulation",
        text: "No action configured for this element.",
      });
      return;
    }
    const action = parseInteraction(operation.after);
    send({
      type: "simulation",
      text:
        action.type === "navigate"
          ? `Navigation preview → ${action.destination}${action.newTab ? " (new tab)" : ""}. No page was opened.`
          : `${action.method} ${action.url}\nMock status: ${action.responseStatus}\n${action.response || "(empty response)"}\nNo network request was sent.`,
    });
  }
  window.addEventListener("message", (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.channel !== channel
    )
      return;
    const message = event.data;
    if (message.type === "draft") {
      try {
        validateDraft(message.draft);
        draft = message.draft;
        initialized = true;
        reconcile();
      } catch (error) {
        send({
          type: "error",
          error:
            error instanceof Error ? error.message : "Invalid draft message",
        });
      }
    } else if (
      message.type === "select" &&
      typeof message.id === "string" &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)
    ) {
      selected = message.id;
      reconcile();
      candidates(message.id)[0]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    } else if (message.type === "settings") {
      editable = message.editable === true;
      simulate = message.simulate === true;
      snap = message.snap === true;
      if (!editable && drag) cancelDrag();
      document.documentElement.dataset.tweakloomMode = simulate
        ? "preview"
        : "edit";
    } else if (message.type === "test-action" && typeof message.id === "string")
      testAction(message.id);
  });
  const elementAt = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("[data-tweakloom-id]")
      : null;
  document.addEventListener(
    "click",
    (event) => {
      if (!initialized) return;
      const el = elementAt(event.target);
      if (
        simulate &&
        el &&
        ["select", "input"].includes(el.tagName.toLowerCase())
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (Date.now() < suppressClickUntil) return;
      if (simulate && el) {
        testAction(el.dataset.tweakloomId!);
        return;
      }
      selected = el?.dataset.tweakloomId ?? null;
      reconcile();
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (initialized) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!initialized || !editable || simulate || event.button !== 0) return;
      const el = elementAt(event.target);
      if (!el) return;
      const position = getComputedStyle(el)
        .translate.split(" ")
        .map((v) => parseFloat(v) || 0);
      // ponytail: translate keeps source layout slots; reparenting needs source-aware layout operations.
      drag = {
        element: el,
        pointer: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: position[0] || 0,
        y: position[1] || 0,
        inline: el.style.translate,
        before:
          baselines.get(el)?.styles.translate ?? getComputedStyle(el).translate,
        moved: false,
      };
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const dx = event.clientX - drag.startX,
        dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        observer.disconnect();
        drag.element.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const round = (v: number) =>
        Math.max(
          -9999,
          Math.min(9999, snap ? Math.round(v / 8) * 8 : Math.round(v)),
        );
      drag.element.style.translate = `${round(drag.x + dx)}px ${round(drag.y + dy)}px`;
    },
    true,
  );
  function cancelDrag() {
    if (drag) {
      drag.element.style.translate = drag.inline;
      drag = null;
      reconcile();
    }
  }
  document.addEventListener("pointercancel", cancelDrag, true);
  document.addEventListener(
    "pointerup",
    (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const state = drag;
      drag = null;
      if (!state.moved) return;
      const after = state.element.style.translate;
      state.element.style.translate = state.inline;
      selected = state.element.dataset.tweakloomId!;
      suppressClickUntil = Date.now() + 250;
      reconcile();
      send({
        type: "edit",
        operation: {
          targetId: selected,
          tag: state.element.tagName.toLowerCase(),
          kind: "style",
          property: "translate",
          before: state.before,
          after,
        },
      });
    },
    true,
  );
  document.addEventListener(
    "dragstart",
    (event) => {
      if (initialized && !simulate) event.preventDefault();
    },
    true,
  );
  document.addEventListener("dragover", (event) => {
    if (
      editable &&
      initialized &&
      event.dataTransfer?.types.includes("application/x-tweakloom")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });
  document.addEventListener("drop", (event) => {
    if (!editable || !initialized || simulate) return;
    try {
      const value = JSON.parse(
        event.dataTransfer?.getData("application/x-tweakloom") || "{}",
      );
      if (
        value.channel !== channel ||
        !presets.some((p) => p.id === value.preset)
      )
        return;
      const container =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tweakloom-container]")
          : null;
      if (!container) {
        send({ type: "error", error: "Drop into a frame or the Draft board." });
        return;
      }
      event.preventDefault();
      observer.disconnect();
      const sample = createPreset(value.preset);
      let placement;
      try {
        container.append(sample);
        const rect = sample.getBoundingClientRect();
        const round = (n: number) =>
          Math.max(
            -9999,
            Math.min(9999, snap ? Math.round(n / 8) * 8 : Math.round(n)),
          );
        placement = {
          before: getComputedStyle(sample).translate,
          after: `${round(event.clientX - rect.left)}px ${round(event.clientY - rect.top)}px`,
        };
      } finally {
        sample.remove();
        observe();
      }
      send({
        type: "insert-request",
        preset: value.preset,
        parentId: container.dataset.tweakloomId,
        placement,
      });
    } catch {
      /* Unrecognized external drag data is not an editor command. */
    }
  });
  const style = document.createElement("style");
  style.textContent =
    '[data-tweakloom-id]{cursor:grab}[data-tweakloom-selected]{outline:2px solid #7655db!important;outline-offset:5px}[data-tweakloom-container]{position:relative}[data-tweakloom-mode="edit"] [data-tweakloom-id]{user-select:none}[data-tweakloom-mode="preview"] [data-tweakloom-id]{cursor:auto}';
  document.head.append(style);
  send({ type: "ready" });
}
