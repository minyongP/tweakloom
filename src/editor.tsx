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
import {
  presets,
  styleFields,
  optionLabels,
  elementLabels,
} from "./shared/catalog.ts";
import type { PresetId } from "./shared/catalog.ts";
import { Library } from "./library.tsx";
import { Inspector, Actions } from "./inspector.tsx";
import { Requests } from "./requests.tsx";
import "./editor.css";

const recoveryKey = "tweakloom:demo:unsaved";
const historyKey = "tweakloom:demo:history";

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
  if (!response.ok)
    throw new Error(result.error ?? "편집안을 저장하지 못했습니다");
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
  const [future, setFuture] = useState<Operation[][]>([]);
  const [rightTab, setRightTab] = useState<"디자인" | "동작" | "추가" | "요청">(
    "디자인",
  );
  const [requestStart, setRequestStart] = useState<{
    element: ElementInfo;
    intent: "create" | "modify";
  } | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [snap, setSnap] = useState(false);
  const [freeMove, setFreeMove] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
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
              "다른 탭에서 저장된 편집안이 바뀌었습니다. 복구한 변경은 유지됩니다. 내보내거나 저장된 편집안을 다시 불러오세요.";
        } catch {
          warning =
            "브라우저 복구 데이터가 올바르지 않아 저장된 파일을 불러왔습니다.";
        }
      }
      if (!recover) sessionStorage.removeItem(recoveryKey);
      let past: Operation[][] = [],
        redo: Operation[][] = [];
      if (recover)
        try {
          const cached = JSON.parse(
            sessionStorage.getItem(historyKey) ?? "null",
          );
          if (cached?.current === JSON.stringify(restored.operations)) {
            if (
              ![cached.past, cached.future].every(
                (stack) => Array.isArray(stack) && stack.length <= 50,
              )
            )
              throw new Error("잘못된 변경 이력입니다");
            for (const operations of [...cached.past, ...cached.future])
              validateDraft({ ...emptyDraft(), operations });
            past = cached.past;
            redo = cached.future;
          }
        } catch {
          warning ||=
            "되돌리기 이력을 복구하지 못했습니다. 편집안은 유지됩니다.";
        }
      setDraft(restored);
      setSavedOperations(JSON.stringify(value.operations));
      setLoaded(true);
      setError(warning);
      setHistory(past);
      setFuture(redo);
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
          showGrid: showGrid && !freeMove,
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
      if (event.data.type === "ask-request" && !saving && !reloading) {
        const element = elements.find((el) => el.id === event.data.id);
        if (element) {
          setRequestStart({ element, intent: "modify" });
          setRightTab("요청");
        }
      }
      if (event.data.type === "history-request") {
        if (event.data.action === "undo") undo();
        if (event.data.action === "redo") redo();
      }
      if (event.data.type === "insert-request" && !saving && !reloading)
        insert(
          event.data.preset,
          event.data.parentId,
          event.data.placement,
          event.data.beforeId,
          event.data.cell,
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
  }, [
    channel,
    draft,
    saving,
    reloading,
    simulate,
    snap,
    freeMove,
    showGrid,
    elements,
    history,
    future,
  ]);
  useEffect(() => {
    send({
      type: "settings",
      editable: !saving && !reloading,
      simulate,
      snap,
      freeMove,
      showGrid: showGrid && !freeMove,
    });
  }, [saving, reloading, simulate, snap, freeMove, showGrid, connected]);
  useEffect(() => {
    if (!loaded) return;
    send({ type: "draft", draft });
    try {
      if (dirty) sessionStorage.setItem(recoveryKey, JSON.stringify(draft));
      else sessionStorage.removeItem(recoveryKey);
      sessionStorage.setItem(
        historyKey,
        JSON.stringify({
          current: JSON.stringify(draft.operations),
          past: history,
          future,
        }),
      );
    } catch {
      setError(
        "브라우저 복구 저장소를 사용할 수 없습니다. 새로고침 전에 편집안을 저장하세요.",
      );
    }
  }, [draft, loaded, dirty, history, future]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,[contenteditable="true"]'))
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [draft, history, future, saving, reloading, loaded]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(operations: Operation[]) {
    validateDraft({ ...draft, operations });
    if (JSON.stringify(operations) === JSON.stringify(draft.operations)) return;
    setHistory((prior) => [...prior.slice(-49), draft.operations]);
    setFuture([]);
    setDraft({ ...draft, operations });
  }
  function startRequest(intent: "create" | "modify") {
    const element =
      intent === "modify"
        ? selected
        : elements.find(
            (el) =>
              el.id ===
              (selected?.container
                ? selected.id
                : (selected?.parentId ?? "draft-board")),
          );
    if (!element) {
      setError("화면에서 컴포넌트를 먼저 선택하세요.");
      return;
    }
    setRequestStart({ element, intent });
    setRightTab("요청");
    setError("");
  }
  function undo() {
    if (!loaded || saving || reloading || !history.length) return;
    pendingSelect.current = null;
    setFuture([...future.slice(-49), draft.operations]);
    setDraft({ ...draft, operations: history.at(-1)! });
    setHistory(history.slice(0, -1));
    setError("");
  }
  function redo() {
    if (!loaded || saving || reloading || !future.length) return;
    pendingSelect.current = null;
    setHistory([...history.slice(-49), draft.operations]);
    setDraft({ ...draft, operations: future.at(-1)! });
    setFuture(future.slice(0, -1));
    setError("");
  }
  function apply(op: Operation) {
    applyMany([op]);
  }
  function applyMany(ops: Operation[]) {
    if (saving || reloading) return;
    try {
      const adjusted = [...ops];
      for (const op of ops) {
        if (op.kind !== "style" || op.property !== "gridTemplateColumns")
          continue;
        const columns = Number(op.after.match(/repeat\((\d+)/)?.[1]);
        if (!columns) continue;
        for (const child of elements.filter(
          (el) => el.parentId === op.targetId,
        )) {
          const span = Math.min(
            columns,
            Number(child.styles.gridColumnEnd.replace("span ", "")) || 1,
          );
          const start = Number(child.styles.gridColumnStart);
          for (const [property, after] of [
            [
              "gridColumnEnd",
              child.styles.gridColumnEnd === "auto" ? "auto" : `span ${span}`,
            ],
            [
              "gridColumnStart",
              start ? String(Math.min(start, columns - span + 1)) : "auto",
            ],
          ] as const) {
            if (after !== child.styles[property])
              adjusted.push({
                targetId: child.id,
                tag: child.tag,
                kind: "style",
                property,
                before:
                  child.baseline?.styles[property] ?? child.styles[property],
                after,
              });
          }
        }
      }
      change(
        adjusted.reduce(
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
    if (!container?.container) throw new Error("추가할 프레임을 선택하세요.");
    if (container.accepts && !container.accepts.includes(tag))
      throw new Error(
        `${id}: ${container.accepts.join(", ")} 컴포넌트만 허용됩니다.`,
      );
  }
  function insert(
    presetId: PresetId,
    parentId?: string,
    placement?: { before: string; after: string },
    beforeId?: string | null,
    cell?: Placement["cell"],
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
      if (beforeId || cell)
        operations = moveOperations(
          operations,
          { id, tag: preset.tag, parentId: parent },
          { parentId: parent, beforeId: beforeId ?? null, cell },
        );
      change(operations);
      setRightTab("디자인");
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
          <span className="stage">개발 버전</span>
        </div>
        <div className="project-name">
          <span className="project-icon">▧</span> Studio Supply{" "}
          <span className="muted">/ 화면 편집안</span>
        </div>
        <div className="header-actions">
          <button
            aria-label="컴포넌트 생성 요청"
            disabled={!connected || saving || reloading}
            onClick={() => startRequest("create")}
          >
            ✦ 새 컴포넌트
          </button>
          <button
            aria-label="되돌리기"
            title="되돌리기 (Ctrl/Cmd+Z)"
            disabled={!history.length || saving || reloading}
            onClick={undo}
          >
            ↶ 되돌리기
          </button>
          <button
            aria-label="다시 실행"
            title="다시 실행 (Ctrl/Cmd+Shift+Z)"
            disabled={!future.length || saving || reloading}
            onClick={redo}
          >
            ↷ 다시 실행
          </button>
          <span className="save-state" aria-live="polite">
            {saving
              ? "저장 중…"
              : dirty
                ? "저장하지 않은 변경"
                : loaded
                  ? `저장됨 · 버전 ${draft.revision}`
                  : "편집안 불러오는 중…"}
          </span>
          <button
            className="primary"
            onClick={save}
            disabled={!loaded || saving || reloading || !dirty}
          >
            편집안 저장
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="layers" aria-label="요소 목록">
          <div className="panel-heading">
            <span>컴포넌트</span>
            <span className="count">{presets.length}</span>
          </div>
          <Library
            freeMove={freeMove}
            side="Left"
            channel={channel}
            disabled={!connected || saving || reloading || simulate}
            insert={insert}
          />
          <div className="panel-heading">
            <span>페이지 요소</span>
            <span className="count">{elements.length}</span>
          </div>
          <div className="page-label">
            ▧ <span>홈 페이지</span>
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
                <span>
                  {elementLabels[el.id] ?? el.id.replaceAll("-", " ")}
                </span>
              </button>
            ))}
          </div>
          <div className="sidebar-note">
            <span className="tiny-label">원본 코드 보존</span>
            <p>
              여기서 편집안을 만들어 보세요.
              <br />
              원본 코드는 그대로 유지됩니다.
            </p>
            <span className="phase-label">화면 편집기 · React 데모</span>
          </div>
        </aside>
        <main className="canvas-area">
          <div className="canvas-toolbar">
            <div>
              <span className="mode-indicator">↖</span>
              <strong>
                {simulate
                  ? "동작 미리보기"
                  : freeMove
                    ? "자유 이동"
                    : "자동 배치"}
              </strong>
              <span className="toolbar-divider" />
              <span className="muted">클릭으로 선택 · 드래그로 이동</span>
            </div>
            <div className="canvas-options">
              {!freeMove && (
                <label>
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  그리드 가이드
                </label>
              )}
              <select
                aria-label="드래그 방식"
                value={freeMove ? "free" : "flow"}
                onChange={(e) => setFreeMove(e.target.value === "free")}
              >
                <option value="flow">자동 배치로 이동</option>
                <option value="free">자유 이동</option>
              </select>
              {freeMove && (
                <label>
                  <input
                    type="checkbox"
                    checked={snap}
                    onChange={(e) => setSnap(e.target.checked)}
                  />
                  8px 격자
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
                동작 미리보기
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
              ↻ <span>미리보기 새로고침</span>
            </button>
          </div>
          <div className="canvas-scroll">
            <div className="canvas-label">
              <span>홈 / 데스크톱</span>
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
                  title="편집 가능한 화면 미리보기"
                  src={`/demo.html#tweakloom=${channel}`}
                  onLoad={() => send({ type: "draft", draft: latest.current })}
                />
              )}
            </div>
            <p className="canvas-hint">실제 화면에서 편집안을 시험해 보세요.</p>
          </div>
          <div className="canvas-footer">
            <span>
              <i className={connected ? "status-dot online" : "status-dot"} />
              {connected ? "미리보기 연결됨" : "미리보기 연결 중…"}
            </span>
            <span>
              변경 {draft.operations.length}개
              <span className="footer-separator">·</span>원본 변경 없음
            </span>
          </div>
        </main>
        <aside className="inspector" aria-label="속성 패널">
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="속성 패널 탭"
          >
            {(["디자인", "동작", "추가", "요청"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={rightTab === tab}
                onClick={() => {
                  setRightTab(tab);
                  if (tab === "요청" && selected && !requestStart)
                    startRequest("modify");
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div hidden={rightTab !== "요청"}>
            <Requests
              draft={draft}
              start={requestStart}
              disabled={saving || reloading || !connected}
              blocked={!!conflicts.length}
              apply={(op) => {
                try {
                  if (
                    !elements.some(
                      (el) => el.id === op.targetId && el.tag === op.tag,
                    )
                  )
                    throw new Error(
                      "요청 대상을 찾을 수 없습니다. 다시 선택하세요.",
                    );
                  change(upsertOperation(draft.operations, op));
                  setError("");
                  return true;
                } catch (e) {
                  setError((e as Error).message);
                  return false;
                }
              }}
              remove={(op) => change(removeOperation(draft.operations, op))}
              onNew={() => startRequest("create")}
              onModify={() => startRequest("modify")}
            />
          </div>
          {rightTab === "요청" ? null : rightTab === "추가" ? (
            <Library
              freeMove={freeMove}
              side="Right"
              channel={channel}
              disabled={!connected || saving || reloading || simulate}
              insert={insert}
            />
          ) : selected && rightTab === "동작" ? (
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
              selectParent={() => {
                if (selected.parentId)
                  send({ type: "select", id: selected.parentId });
              }}
            />
          ) : (
            <div className="empty-inspector">
              <div className="cursor-glyph">↖</div>
              <h2>편집할 요소를 선택하세요</h2>
              <p>화면을 클릭하거나 왼쪽 목록에서 요소를 선택해 수정하세요.</p>
            </div>
          )}
          <section className="changes">
            <div className="changes-heading">
              <h2>
                변경 사항{" "}
                <span className="count">{draft.operations.length}</span>
              </h2>
              <span className="muted">{history.length}단계 되돌리기</span>
            </div>
            {!draft.operations.length && (
              <p className="muted">수정한 내용이 여기에 표시됩니다.</p>
            )}
            {draft.operations.map((op) => (
              <div className="change" key={operationKey(op)}>
                <span className="change-dot" />
                <div>
                  <strong>{op.targetId}</strong>
                  <p>
                    {op.kind === "style"
                      ? styleFields[op.property].label
                      : {
                          text: "텍스트",
                          options: "선택 항목",
                          interaction: "동작",
                          move: "이동",
                          insert: "추가",
                          request: "요청",
                        }[op.kind]}{" "}
                    →{" "}
                    {op.kind === "request"
                      ? "컴포넌트 요청"
                      : op.kind === "interaction"
                        ? "클릭 동작"
                        : (optionLabels[op.after] ?? op.after) || "(비어 있음)"}
                  </p>
                </div>
                <button
                  aria-label={`변경 삭제 ${operationKey(op)}`}
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
              편집안 JSON 내보내기 <span>↗</span>
            </button>
            <p>요청 탭에서 Codex / Claude에 전달할 내용을 만드세요.</p>
            <button
              className="text-button"
              disabled={saving || reloading}
              onClick={() => {
                if (
                  !dirty ||
                  confirm(
                    "저장하지 않은 변경을 버리고 저장된 편집안을 불러올까요?",
                  )
                )
                  void load();
              }}
            >
              저장된 편집안 불러오기
            </button>
          </div>
        </aside>
      </div>
      {simulation && (
        <section className="simulation-result" aria-label="동작 미리보기 결과">
          <div>
            <strong>동작 미리보기 결과</strong>
            <button
              aria-label="동작 미리보기 닫기"
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
            {error ? "편집안을 확인해 주세요" : "변경 대상을 확인해 주세요"}
          </strong>
          <span>{error || conflicts.join(" · ")}</span>
          <small>
            편집안은 유지됩니다. 해당 변경을 삭제하거나 앱의 원래 상태를 복원한
            뒤 계속하세요.
          </small>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
