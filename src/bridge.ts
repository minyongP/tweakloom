import { presets } from "./shared/catalog.ts";
import {
  emptyDraft,
  operationKey,
  styleProperties,
  validateDraft,
  parseInteraction,
  parseComponentRequest,
  parsePlacement,
} from "./shared/draft.ts";
import type {
  Draft,
  ElementInfo,
  Operation,
  Placement,
} from "./shared/draft.ts";
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
    freeMove = false,
    showGrid = true,
    snap = false;
  let lastReport = "",
    suppressClickUntil = 0;
  const inserted = new Set<HTMLElement>();
  const moved: {
    element: HTMLElement;
    parent: Node;
    next: Node | null;
    appliedParent: Node;
  }[] = [];
  // Outside the observed app subtree so drawing the guide never triggers replay.
  const guide = document.createElement("div");
  guide.setAttribute("aria-label", "Insertion guide");
  guide.style.cssText =
    "display:none;position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7956ce;background:#7956ce22;border-radius:3px;";
  document.documentElement.append(guide);
  const gridGuide = document.createElement("div");
  gridGuide.setAttribute("aria-label", "Grid guides");
  gridGuide.style.cssText =
    "display:none;position:fixed;pointer-events:none;z-index:2147483646;";
  document.documentElement.append(gridGuide);
  const askButton = document.createElement("button");
  askButton.textContent = "✦ Ask AI";
  askButton.type = "button";
  askButton.setAttribute("aria-label", "Ask AI about selected component");
  askButton.dataset.tweakloomRequestButton = "";
  askButton.style.cssText =
    "display:none;position:fixed;z-index:2147483647;margin:0;padding:7px 10px;background:#7956ce;color:white;border:0;border-radius:5px;font:12px Arial,sans-serif;box-shadow:0 2px 8px #0002;";
  askButton.addEventListener("click", () => {
    if (selected) send({ type: "ask-request", id: selected });
  });
  document.documentElement.append(askButton);
  function drawGrid() {
    const chosen = selected ? candidates(selected)[0] : null;
    askButton.style.display = "none";
    if (chosen && !simulate && editable) {
      const r = chosen.getBoundingClientRect();
      if (
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      )
        Object.assign(askButton.style, {
          display: "block",
          left: `${Math.max(4, Math.min(innerWidth - 90, r.right - 84))}px`,
          top: `${Math.max(4, r.top - 34)}px`,
        });
    }
    const container = chosen?.hasAttribute("data-tweakloom-container")
      ? chosen
      : chosen?.parentElement?.closest<HTMLElement>(
          "[data-tweakloom-container]",
        );
    gridGuide.style.display = "none";
    if (!showGrid || simulate || !container) return;
    const css = getComputedStyle(container);
    if (!css.display.includes("grid")) return;
    const cols = css.gridTemplateColumns.split(" ").filter(Boolean);
    const rows =
      css.gridTemplateRows === "none"
        ? []
        : css.gridTemplateRows.split(" ").filter(Boolean);
    if (
      !cols.length ||
      cols[0] === "none" ||
      cols.length > 12 ||
      rows.length > 40
    )
      return;
    const rect = container.getBoundingClientRect();
    const px = (v: string) => parseFloat(v) || 0;
    Object.assign(gridGuide.style, {
      display: "grid",
      left: `${rect.left + container.clientLeft + px(css.paddingLeft)}px`,
      top: `${rect.top + container.clientTop + px(css.paddingTop)}px`,
      width: `${container.clientWidth - px(css.paddingLeft) - px(css.paddingRight)}px`,
      height: `${container.clientHeight - px(css.paddingTop) - px(css.paddingBottom)}px`,
      gridTemplateColumns: css.gridTemplateColumns,
      gridTemplateRows: rows.length ? css.gridTemplateRows : "1fr",
      columnGap: css.columnGap,
      rowGap: css.rowGap,
      alignContent: css.alignContent,
      justifyContent: css.justifyContent,
    });
    gridGuide.replaceChildren(
      ...Array.from({ length: cols.length * Math.max(1, rows.length) }, () => {
        const cell = document.createElement("div");
        cell.style.cssText =
          "border:1px dashed #7956ce88;background:#7956ce08;min-width:0;min-height:0;";
        return cell;
      }),
    );
  }
  document.addEventListener("scroll", drawGrid, true);
  window.addEventListener("resize", drawGrid);
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
    accepts: el.dataset.tweakloomAccept?.split(" "),
    nextId:
      [...(el.parentElement?.children ?? [])]
        .slice([...(el.parentElement?.children ?? [])].indexOf(el) + 1)
        .find((next) => next.hasAttribute("data-tweakloom-id"))
        ?.getAttribute("data-tweakloom-id") ?? null,
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
    for (const item of moved.reverse()) {
      if (
        item.element.parentNode === item.appliedParent &&
        item.parent.isConnected
      )
        item.parent.insertBefore(
          item.element,
          item.next?.parentNode === item.parent ? item.next : null,
        );
    }
    moved.length = 0;
  }
  const accepts = (parent: HTMLElement, tag: string) =>
    !parent.dataset.tweakloomAccept ||
    parent.dataset.tweakloomAccept.split(" ").includes(tag);
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
        if (!accepts(parents[0], op.tag)) {
          conflicts.push(
            `${op.parentId}: accepts ${parents[0].dataset.tweakloomAccept} components only`,
          );
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
      if (op.kind === "insert" || op.kind === "move") continue;
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
        (op.kind === "text" && !info(el).leaf) ||
        (op.kind === "request" &&
          parseComponentRequest(op.after).intent === "create" &&
          !info(el).container)
      ) {
        conflicts.push(`${op.targetId}: structure changed in the app`);
        continue;
      }
      if (op.kind === "interaction" || op.kind === "request") continue;
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
    for (const op of draft.operations.filter((op) => op.kind === "move")) {
      const placement = parsePlacement(op.after);
      const matches = candidates(op.targetId),
        parents = candidates(placement.parentId);
      const anchors = placement.beforeId ? candidates(placement.beforeId) : [];
      const el = matches[0],
        container = parents[0],
        anchor = anchors[0] ?? null;
      if (
        matches.length !== 1 ||
        parents.length !== 1 ||
        el.tagName.toLowerCase() !== op.tag ||
        !container.hasAttribute("data-tweakloom-container") ||
        !accepts(container, op.tag) ||
        el.contains(container) ||
        (placement.beforeId &&
          (anchors.length !== 1 || anchor?.parentElement !== container)) ||
        (op.before && baselines.get(el)?.parentId !== op.before)
      ) {
        conflicts.push(
          `${op.targetId}: layout target changed or violates container rules`,
        );
        continue;
      }
      moved.push({
        element: el,
        parent: el.parentNode!,
        next: el.nextSibling,
        appliedParent: container,
      });
      container.insertBefore(el, anchor);
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
    drawGrid();
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
      if (freeMove !== (message.freeMove === true) && drag) cancelDrag();
      freeMove = message.freeMove === true;
      showGrid = message.showGrid !== false;
      if (!editable && drag) cancelDrag();
      document.documentElement.dataset.tweakloomMode = simulate
        ? "preview"
        : "edit";
      drawGrid();
    } else if (
      message.type === "nudge" &&
      editable &&
      !simulate &&
      typeof message.id === "string" &&
      ["earlier", "later"].includes(message.direction)
    ) {
      const el = candidates(message.id)[0],
        container = el?.parentElement;
      if (!el || !container?.hasAttribute("data-tweakloom-container")) return;
      const siblings = [...container.children].filter((child) =>
        child.hasAttribute("data-tweakloom-id"),
      );
      const index = siblings.indexOf(el),
        targetIndex = index + (message.direction === "earlier" ? -1 : 1);
      if (targetIndex < 0 || targetIndex >= siblings.length) return;
      const anchor =
        message.direction === "earlier"
          ? siblings[targetIndex]
          : siblings[targetIndex + 1];
      send({
        type: "move-request",
        id: el.dataset.tweakloomId,
        placement: {
          parentId: container.dataset.tweakloomId,
          beforeId:
            (anchor as HTMLElement | undefined)?.dataset.tweakloomId ?? null,
        },
      });
    } else if (message.type === "test-action" && typeof message.id === "string")
      testAction(message.id);
  });
  const elementAt = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("[data-tweakloom-id]")
      : null;
  function findPlacement(
    x: number,
    y: number,
    moving?: HTMLElement,
  ): Placement | null {
    let container =
      document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-tweakloom-container]") ?? null;
    if (
      container &&
      container !== moving &&
      container.parentElement?.hasAttribute("data-tweakloom-container")
    ) {
      // ponytail: a 12px edge targets siblings; add explicit drop zones if nested frames become ambiguous.
      const rect = container.getBoundingClientRect();
      if (
        y < rect.top + 12 ||
        y > rect.bottom - 12 ||
        x < rect.left + 12 ||
        x > rect.right - 12
      )
        container = container.parentElement;
    }
    if (container === moving)
      container =
        moving.parentElement?.closest<HTMLElement>(
          "[data-tweakloom-container]",
        ) ?? null;
    if (
      !container ||
      (moving &&
        (moving.contains(container) ||
          !accepts(container, moving.tagName.toLowerCase())))
    ) {
      guide.style.display = "none";
      return null;
    }
    const css = getComputedStyle(container);
    const horizontal =
      css.display.includes("grid") ||
      (css.display.includes("flex") && css.flexDirection.startsWith("row"));
    const reverse =
      css.flexDirection.endsWith("reverse") && css.display.includes("flex");
    const children = [...container.children].filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        el !== moving &&
        !!el.dataset.tweakloomId &&
        getComputedStyle(el).position !== "absolute",
    );
    let anchor: HTMLElement | undefined;
    if (horizontal) {
      const rows: { top: number; bottom: number; children: HTMLElement[] }[] =
        [];
      for (const child of children) {
        const r = child.getBoundingClientRect();
        const row = rows.find(
          (row) => r.top < row.bottom && r.bottom > row.top,
        );
        if (row) {
          row.top = Math.min(row.top, r.top);
          row.bottom = Math.max(row.bottom, r.bottom);
          row.children.push(child);
        } else rows.push({ top: r.top, bottom: r.bottom, children: [child] });
      }
      rows.sort((a, b) => a.top - b.top);
      const index = rows.findIndex(
        (row, i) =>
          y <= (rows[i + 1] ? (row.bottom + rows[i + 1].top) / 2 : row.bottom),
      );
      const row = rows[index];
      if (row)
        anchor =
          row.children.find((child) => {
            const r = child.getBoundingClientRect();
            return reverse
              ? x > r.left + r.width / 2
              : x < r.left + r.width / 2;
          }) ?? rows[index + 1]?.children[0];
    } else
      anchor = children.find((child) => {
        const r = child.getBoundingClientRect();
        return reverse ? y > r.top + r.height / 2 : y < r.top + r.height / 2;
      });
    const rect = (
      anchor ??
      children.at(-1) ??
      container
    ).getBoundingClientRect();
    const end = !anchor;
    Object.assign(guide.style, {
      display: "block",
      left: `${horizontal && children.length ? (end !== reverse ? rect.right : rect.left) - 2 : rect.left}px`,
      top: `${!horizontal && children.length ? (end !== reverse ? rect.bottom : rect.top) - 2 : rect.top}px`,
      width: `${horizontal && children.length ? 4 : rect.width}px`,
      height: `${!horizontal && children.length ? 4 : rect.height}px`,
    });
    return {
      parentId: container.dataset.tweakloomId!,
      beforeId: anchor?.dataset.tweakloomId ?? null,
    };
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!initialized) return;
      if (
        event.target instanceof Element &&
        event.target.closest("[data-tweakloom-request-button]")
      )
        return;
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
      // Legacy free-move drafts retain their visual offsets.
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
        askButton.style.display = "none";
        observer.disconnect();
        drag.element.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      if (!freeMove) {
        findPlacement(event.clientX, event.clientY, drag.element);
        return;
      }
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
    guide.style.display = "none";
    if (drag) {
      drag.element.style.translate = drag.inline;
      drag = null;
      reconcile();
    }
  }
  document.addEventListener("pointercancel", cancelDrag, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        cancelDrag();
        return;
      }
      if (
        !initialized ||
        !editable ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,[contenteditable="true"]'))
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelDrag();
      send({
        type: "history-request",
        action: key === "y" || event.shiftKey ? "redo" : "undo",
      });
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const state = drag;
      drag = null;
      if (!state.moved) return;
      if (!freeMove) {
        const placement = findPlacement(
          event.clientX,
          event.clientY,
          state.element,
        );
        guide.style.display = "none";
        selected = state.element.dataset.tweakloomId!;
        suppressClickUntil = Date.now() + 250;
        reconcile();
        if (placement) send({ type: "move-request", id: selected, placement });
        else
          send({
            type: "error",
            error: "Drop into a compatible frame or between its components.",
          });
        return;
      }
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
      !simulate &&
      event.dataTransfer?.types.includes("application/x-tweakloom")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      askButton.style.display = "none";
      if (!freeMove) findPlacement(event.clientX, event.clientY);
    }
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) guide.style.display = "none";
  });
  document.addEventListener("dragend", () => {
    guide.style.display = "none";
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
      if (!freeMove) {
        event.preventDefault();
        const placement = findPlacement(event.clientX, event.clientY);
        guide.style.display = "none";
        if (placement)
          send({
            type: "insert-request",
            preset: value.preset,
            parentId: placement.parentId,
            beforeId: placement.beforeId,
          });
        else
          send({
            type: "error",
            error: "Drop into a frame or the Draft board.",
          });
        return;
      }
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
