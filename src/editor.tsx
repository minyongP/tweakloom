import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyDraft,
  operationKey,
  upsertOperation,
  validateDraft,
  removeOperation,
  moveOperations,
} from "./shared/draft.ts";
import type {
  Draft,
  ElementInfo,
  Operation,
  Placement,
} from "./shared/draft.ts";
import { presets } from "./shared/catalog.ts";
import type { PresetId } from "./shared/catalog.ts";
import { Library } from "./library.tsx";
import { Inspector, Actions } from "./inspector.tsx";
import "./editor.css";

const recoveryKey = "tweakloom:demo:unsaved";

async function requestDraft(
  method: "GET" | "PUT",
  draft?: Draft,
): Promise<Draft> {
  const response = await fetch("/api/draft", {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Tweakloom-Token": __DRAFT_TOKEN__,
    },
    ...(draft
      ? { body: JSON.stringify({ expectedRevision: draft.revision, draft }) }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Could not save draft");
  validateDraft(result);
  return result;
}

function App() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savedOperations, setSavedOperations] = useState("[]");
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [selected, setSelected] = useState<ElementInfo | null>(null);
  const [elements, setElements] = useState<ElementInfo[]>([]);
  const [generation, setGeneration] = useState(0);
  const [history, setHistory] = useState<Operation[][]>([]);
  const [rightTab, setRightTab] = useState<"Design" | "Actions" | "Insert">(
    "Design",
  );
  const [simulate, setSimulate] = useState(false);
  const [snap, setSnap] = useState(false);
  const [freeMove, setFreeMove] = useState(false);
  const [simulation, setSimulation] = useState("");
  const pendingSelect = useRef<string | null>(null);
  const [channel] = useState(() => crypto.randomUUID());
  const iframe = useRef<HTMLIFrameElement>(null);
  const latest = useRef(draft);
  latest.current = draft;
  const dirty = JSON.stringify(draft.operations) !== savedOperations;
  const send = (message: object) =>
    iframe.current?.contentWindow?.postMessage(
      { channel, ...message },
      location.origin,
    );

  async function load(recover = false) {
    setReloading(true);
    try {
      const value = await requestDraft("GET");
      let restored = value;
      let warning = "";
      const raw = recover ? sessionStorage.getItem(recoveryKey) : null;
      if (raw) {
        try {
          const cached: unknown = JSON.parse(raw);
          validateDraft(cached);
          restored = cached;
          if (cached.revision !== value.revision)
            warning =
              "Saved draft changed in another tab. Your recovered edits are kept; export them or reload the saved draft.";
        } catch {
          warning =
            "Browser recovery data is invalid. The saved file was loaded.";
        }
      }
      if (!recover) sessionStorage.removeItem(recoveryKey);
      setDraft(restored);
      setSavedOperations(JSON.stringify(value.operations));
      setLoaded(true);
      setError(warning);
      setHistory([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReloading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.current?.contentWindow ||
        event.data?.channel !== channel
      )
        return;
      if (event.data.type === "ready") {
        send({ type: "draft", draft: latest.current });
        send({
          type: "settings",
          editable: !saving && !reloading,
          simulate,
          snap,
          freeMove,
        });
      }
      if (
        event.data.type === "state" &&
        Array.isArray(event.data.elements) &&
        Array.isArray(event.data.conflicts)
      ) {
        setConnected(true);
        setElements(event.data.elements);
        setSelected(event.data.selected);
        setConflicts(event.data.conflicts);
        if (
          pendingSelect.current &&
          event.data.elements.some(
            (el: ElementInfo) => el.id === pendingSelect.current,
          )
        ) {
          send({ type: "select", id: pendingSelect.current });
          pendingSelect.current = null;
        }
      }
      if (event.data.type === "edit" && !saving && !reloading)
        apply(event.data.operation);
      if (event.data.type === "insert-request" && !saving && !reloading)
        insert(
          event.data.preset,
          event.data.parentId,
          event.data.placement,
          event.data.beforeId,
        );
      if (
        event.data.type === "move-request" &&
        !saving &&
        !reloading &&
        !simulate
      ) {
        const target = elements.find((el) => el.id === event.data.id);
        if (target)
          try {
            checkContainer(event.data.placement.parentId, target.tag);
            change(
              moveOperations(draft.operations, target, event.data.placement),
            );
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
      }
      if (
        event.data.type === "simulation" &&
        typeof event.data.text === "string"
      )
        setSimulation(event.data.text);
      if (event.data.type === "error" && typeof event.data.error === "string")
        setError(event.data.error);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [channel, draft, saving, reloading, simulate, snap, freeMove, elements]);
  useEffect(() => {
    send({
      type: "settings",
      editable: !saving && !reloading,
      simulate,
      snap,
      freeMove,
    });
  }, [saving, reloading, simulate, snap, freeMove, connected]);
  useEffect(() => {
    if (!loaded) return;
    send({ type: "draft", draft });
    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify(draft));
      else sessionStorage.removeItem(recoveryKey);
    } catch {
      setError(
        "Browser recovery storage is unavailable. Save the draft before refreshing.",
      );
    }
  }, [draft, loaded, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(operations: Operation[]) {
    validateDraft({ ...draft, operations });
    setHistory((prior) => [...prior.slice(-49), draft.operations]);
    setDraft({ ...draft, operations });
  }
  function apply(op: Operation) {
    applyMany([op]);
  }
  function applyMany(ops: Operation[]) {
    if (saving || reloading) return;
    try {
      change(
        ops.reduce(
          (operations, op) => upsertOperation(operations, op),
          draft.operations,
        ),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function checkContainer(id: string, tag: string) {
    const container = elements.find((el) => el.id === id);
    if (!container?.container) throw new Error("Select an insertion frame.");
    if (container.accepts && !container.accepts.includes(tag))
      throw new Error(
        `${id} accepts ${container.accepts.join(", ")} components only.`,
      );
  }
  function insert(
    presetId: PresetId,
    parentId?: string,
    placement?: { before: string; after: string },
    beforeId?: string | null,
  ) {
    if (!loaded || saving || reloading) return;
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const id = `draft-${crypto.randomUUID()}`;
    const parent =
      parentId ??
      (selected?.container ? selected.id : selected?.parentId) ??
      "draft-board";
    try {
      checkContainer(parent, preset.tag);
      pendingSelect.current = id;
      let operations = upsertOperation(draft.operations, {
        targetId: id,
        tag: preset.tag,
        kind: "insert",
        parentId: parent,
        before: "",
        after: preset.id,
      });
      if (placement)
        operations = upsertOperation(operations, {
          targetId: id,
          tag: preset.tag,
          kind: "style",
          property: "translate",
          before: placement.before,
          after: placement.after,
        });
      if (beforeId)
        operations = moveOperations(
          operations,
          { id, tag: preset.tag, parentId: parent },
          { parentId: parent, beforeId },
        );
      change(operations);
      setRightTab("Design");
      setError("");
    } catch (e) {
      pendingSelect.current = null;
      setError((e as Error).message);
    }
  }
  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await requestDraft("PUT", draft);
      setDraft(result);
      setSavedOperations(JSON.stringify(result.operations));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "tweakloom-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="wordmark">
          <span className="logo">t</span>tweakloom
          <span className="stage">EARLY BUILD</span>
        </div>
        <div className="project-name">
          <span className="project-icon">▧</span> Studio Supply{" "}
          <span className="muted">/ visual draft</span>
        </div>
        <div className="header-actions">
          <span className="save-state" aria-live="polite">
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : loaded
                  ? `Saved · revision ${draft.revision}`
                  : "Loading draft…"}
          </span>
          <button
            className="primary"
            onClick={save}
            disabled={!loaded || saving || reloading || !dirty}
          >
            Save draft
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="layers" aria-label="Elements">
          <div className="panel-heading">
            <span>COMPONENTS</span>
            <span className="count">{presets.length}</span>
          </div>
          <Library
            side="Left"
            channel={channel}
            disabled={!connected || saving || reloading || simulate}
            insert={insert}
          />
          <div className="panel-heading">
            <span>PAGE ELEMENTS</span>
            <span className="count">{elements.length}</span>
          </div>
          <div className="page-label">
            ▧ <span>Home page</span>
            <span className="muted">↗</span>
          </div>
          <div className="element-list">
            {elements.map((el, index) => (
              <button
                key={`${el.id}-${index}`}
                className={
                  selected?.id === el.id ? "element active" : "element"
                }
                onClick={() => {
                  setSelected(null);
                  send({ type: "select", id: el.id });
                }}
                aria-pressed={selected?.id === el.id}
              >
                <span className="tag-icon">
                  {el.tag.startsWith("h") ? "T" : el.leaf ? "≡" : "▣"}
                </span>
                <span>{el.id.replaceAll("-", " ")}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <span className="tiny-label">YOUR CODE STAYS YOURS</span>
            <p>
              Make a draft here.
              <br />
              Your source stays untouched.
            </p>
            <span className="phase-label">Visual workspace · React demo</span>
          </div>
        </aside>
        <main className="canvas-area">
          <div className="canvas-toolbar">
            <div>
              <span className="mode-indicator">↖</span>
              <strong>
                {simulate
                  ? "Preview actions"
                  : freeMove
                    ? "Free move"
                    : "Auto layout"}
              </strong>
              <span className="toolbar-divider" />
              <span className="muted">Click to select · drag to move</span>
            </div>
            <div className="canvas-options">
              <select
                aria-label="Drag behavior"
                value={freeMove ? "free" : "flow"}
                onChange={(e) => setFreeMove(e.target.value === "free")}
              >
                <option value="flow">Arrange components</option>
                <option value="free">Free move (advanced)</option>
              </select>
              {freeMove && (
                <label>
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(e) => setSnap(e.target.checked)}
                  />
                  8px grid
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={simulate}
                  onChange={(e) => {
                    setSimulate(e.target.checked);
                    setSimulation("");
                  }}
                />
                Preview actions
              </label>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                setConnected(false);
                setSelected(null);
                setGeneration((n) => n + 1);
              }}
            >
              ↻ <span>Reload preview</span>
            </button>
          </div>
          <div className="canvas-scroll">
            <div className="canvas-label">
              <span>HOME / DESKTOP</span>
              <span>
                React + Vite <span className="dot">●</span>
              </span>
            </div>
            <div className="preview-shell">
              <div className="browser-bar">
                <span className="browser-dots">● ● ●</span>
                <span>studio-supply.local /</span>
                <span>↗</span>
              </div>
              {loaded && (
                <iframe
                  key={generation}
                  ref={iframe}
                  title="Editable frontend preview"
                  src={`/demo.html#tweakloom=${channel}`}
                  onLoad={() => send({ type: "draft", draft: latest.current })}
                />
              )}
            </div>
            <p className="canvas-hint">A real page. A safe place to explore.</p>
          </div>
          <div className="canvas-footer">
            <span>
              <i className={connected ? "status-dot online" : "status-dot"} />
              {connected ? "Preview connected" : "Connecting preview…"}
            </span>
            <span>
              {draft.operations.length} draft change
              {draft.operations.length === 1 ? "" : "s"}
              <span className="footer-separator">·</span>Source unchanged
            </span>
          </div>
        </main>
        <aside className="inspector" aria-label="Inspector">
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Inspector sections"
          >
            {(["Design", "Actions", "Insert"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={rightTab === tab}
                onClick={() => setRightTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {rightTab === "Insert" ? (
            <Library
              side="Right"
              channel={channel}
              disabled={!connected || saving || reloading || simulate}
              insert={insert}
            />
          ) : selected && rightTab === "Actions" ? (
            <Actions
              key={`${selected.id}:${draft.operations.find((op) => op.targetId === selected.id && op.kind === "interaction")?.after ?? ""}`}
              element={selected}
              disabled={saving || reloading}
              operation={draft.operations.find(
                (op) =>
                  op.targetId === selected.id && op.kind === "interaction",
              )}
              apply={apply}
              test={() => send({ type: "test-action", id: selected.id })}
              remove={() =>
                change(
                  draft.operations.filter(
                    (op) =>
                      !(
                        op.targetId === selected.id && op.kind === "interaction"
                      ),
                  ),
                )
              }
            />
          ) : selected ? (
            <Inspector
              key={selected.id}
              element={selected}
              disabled={saving || reloading}
              apply={apply}
              applyMany={applyMany}
              freeMove={freeMove}
              nudge={(direction) =>
                send({ type: "nudge", id: selected.id, direction })
              }
            />
          ) : (
            <div className="empty-inspector">
              <div className="cursor-glyph">↖</div>
              <h2>Select something to start</h2>
              <p>
                Click the page or choose an element from the list. Then make it
                yours.
              </p>
            </div>
          )}
          <section className="changes">
            <div className="changes-heading">
              <h2>
                Draft changes{" "}
                <span className="count">{draft.operations.length}</span>
              </h2>
              <button
                disabled={!history.length || saving || reloading}
                onClick={() => {
                  setDraft({ ...draft, operations: history.at(-1)! });
                  setHistory(history.slice(0, -1));
                }}
              >
                Undo
              </button>
            </div>
            {!draft.operations.length && (
              <p className="muted">Your adjustments will appear here.</p>
            )}
            {draft.operations.map((op) => (
              <div className="change" key={operationKey(op)}>
                <span className="change-dot" />
                <div>
                  <strong>{op.targetId}</strong>
                  <p>
                    {op.kind === "style" ? op.property : op.kind} →{" "}
                    {op.kind === "interaction"
                      ? "Click action"
                      : op.after || "(empty)"}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${operationKey(op)}`}
                  disabled={saving || reloading}
                  onClick={() => change(removeOperation(draft.operations, op))}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
          <div className="inspector-bottom">
            <button
              className="export-button"
              onClick={exportDraft}
              disabled={
                !draft.operations.length || !!conflicts.length || !connected
              }
            >
              Export draft JSON <span>↗</span>
            </button>
            <p>AI handoff is coming in a later phase.</p>
            <button
              className="text-button"
              disabled={saving || reloading}
              onClick={() => {
                if (
                  !dirty ||
                  confirm("Discard unsaved edits and reload the saved draft?")
                )
                  void load();
              }}
            >
              Reload saved draft
            </button>
          </div>
        </aside>
      </div>
      {simulation && (
        <section className="simulation-result" aria-label="Action preview">
          <div>
            <strong>Action preview</strong>
            <button
              aria-label="Close action preview"
              onClick={() => setSimulation("")}
            >
              ×
            </button>
          </div>
          <pre>{simulation}</pre>
        </section>
      )}
      {(error || conflicts.length > 0) && (
        <div className="error-banner" role="alert">
          <strong>
            {error ? "Draft needs attention" : "Reconnect these changes"}
          </strong>
          <span>{error || conflicts.join(" · ")}</span>
          <small>
            Keep the draft. Remove the affected change or restore the original
            app state before continuing.
          </small>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
