import {
  emptyDraft,
  operationKey,
  styleProperties,
  validateDraft,
} from "./shared/draft.ts";
import type { Draft, ElementInfo, Operation } from "./shared/draft.ts";

// Opt-in demo bridge. Not imported into production builds.
const channel = new URLSearchParams(location.hash.slice(1)).get("tweakloom");
if (channel && /^[a-f0-9-]{36}$/.test(channel) && window.parent !== window)
  start(channel);

function start(channel: string) {
  let draft: Draft = emptyDraft();
  let selected: string | null = null;
  let initialized = false;
  let pending = false;
  let lastReport = "";
  const active = new Map<
    string,
    {
      element: HTMLElement;
      operation: Operation;
      original: string;
      applied: string;
    }
  >();
  const send = (message: object) =>
    parent.postMessage({ channel, ...message }, location.origin);
  const candidates = (id: string) =>
    [...document.querySelectorAll<HTMLElement>("[data-tweakloom-id]")].filter(
      (el) => el.dataset.tweakloomId === id,
    );
  const read = (el: HTMLElement, op: Operation) =>
    op.kind === "text"
      ? (el.textContent ?? "")
      : getComputedStyle(el)[op.property];
  const info = (el: HTMLElement): ElementInfo => ({
    id: el.dataset.tweakloomId!,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").slice(0, 2000),
    leaf: el.children.length === 0,
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
    if (!pending && initialized) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        reconcile();
      });
    }
  });

  function reconcile() {
    observer.disconnect();
    const conflicts: string[] = [];
    // Restore only values we still own, then compare every operation against
    // the same pre-draft DOM. Parent styles cannot become a child's baseline.
    for (const previous of active.values()) {
      if (
        previous.element.isConnected &&
        read(previous.element, previous.operation) === previous.applied
      ) {
        if (previous.operation.kind === "text")
          previous.element.textContent = previous.original;
        else
          previous.element.style[previous.operation.property] =
            previous.original;
      }
    }
    active.clear();
    const baselines = new Map(
      [...document.querySelectorAll<HTMLElement>("[data-tweakloom-id]")].map(
        (el) => [el, info(el)],
      ),
    );
    for (const op of draft.operations) {
      const key = operationKey(op);
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
        (op.kind === "text" && el.children.length)
      ) {
        conflicts.push(`${op.targetId}: structure changed in the app`);
        continue;
      }
      const baseline = baselines.get(el)!;
      const current =
        op.kind === "text" ? baseline.text : baseline.styles[op.property];
      if (current !== op.before) {
        conflicts.push(`${op.targetId}: value changed in the app`);
        continue;
      }
      const original = op.kind === "text" ? current : el.style[op.property];
      if (op.kind === "text") el.textContent = op.after;
      else el.style[op.property] = op.after;
      active.set(key, {
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
      } catch {
        send({ type: "error", error: "Invalid draft message" });
      }
    } else if (
      message.type === "select" &&
      typeof message.id === "string" &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(message.id)
    ) {
      selected = message.id;
      reconcile();
    }
  });
  document.addEventListener(
    "click",
    (event) => {
      if (!initialized) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const el =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tweakloom-id]")
          : null;
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
  const style = document.createElement("style");
  style.textContent =
    "[data-tweakloom-id]{cursor:crosshair}[data-tweakloom-selected]{outline:2px solid #7655db!important;outline-offset:5px}";
  document.head.append(style);
  send({ type: "ready" });
}
