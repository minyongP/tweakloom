import { useEffect, useState } from "react";
import { buildHandoff, parseComponentRequest } from "./shared/draft.ts";
import type {
  ComponentRequest,
  Draft,
  ElementInfo,
  Operation,
} from "./shared/draft.ts";

export function Requests({
  draft,
  start,
  disabled,
  blocked,
  apply,
  remove,
  onNew,
  onModify,
}: {
  draft: Draft;
  start: { element: ElementInfo; intent: "create" | "modify" } | null;
  disabled: boolean;
  blocked: boolean;
  apply: (operation: Operation) => boolean;
  remove: (operation: Operation) => void;
  onNew: () => void;
  onModify: () => void;
}) {
  const [target, setTarget] = useState<ComponentRequest["context"] | null>(
    null,
  );
  const [intent, setIntent] = useState<"create" | "modify">("modify");
  const [prompt, setPrompt] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [fallback, setFallback] = useState("");
  useEffect(() => {
    if (start) {
      const { id, tag, text, styles, parentId, container, accepts } =
        start.element;
      setTarget({ id, tag, text, styles, parentId, container, accepts });
      setIntent(start.intent);
      setEditing(null);
      setNotice("");
    }
  }, [start]);
  const requests = draft.operations.filter((op) => op.kind === "request");
  function save() {
    if (!target) return;
    try {
      const after = JSON.stringify({
        intent,
        prompt: prompt.trim(),
        context: target,
      });
      parseComponentRequest(after);
      if (
        !apply({
          kind: "request",
          requestId: editing ?? crypto.randomUUID(),
          targetId: target.id,
          tag: target.tag,
          before: "",
          after,
        })
      )
        return;
      setPrompt("");
      setEditing(null);
      setNotice("Request added to draft. Save draft to keep it on disk.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function copy() {
    try {
      const text = buildHandoff(draft);
      await navigator.clipboard.writeText(text);
      setNotice(
        "Copied. Paste into Codex or Claude to request implementation.",
      );
      setFallback("");
    } catch {
      setFallback(buildHandoff(draft));
      setNotice("Clipboard unavailable. Copy the text below.");
    }
  }
  function download() {
    const blob = new Blob([buildHandoff(draft)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tweakloom-ai-request.md";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Downloaded a snapshot. No AI task has started.");
  }
  return (
    <section className="requests-panel" aria-label="Component requests">
      <h2>Ask for a change</h2>
      <p className="field-hint">
        Select something on the page, then describe the result you want.
      </p>
      <fieldset disabled={disabled}>
        <div className="request-mode">
          <button onClick={onModify}>Modify selected</button>
          <button onClick={onNew}>Create in frame</button>
        </div>
        <div className="request-target" aria-label="Request target">
          <strong>
            {intent === "create" ? "Create component" : "Modify component"}
          </strong>
          <span>{target?.id ?? "Select a component first"}</span>
        </div>
        <label htmlFor="change-request">Change request</label>
        <textarea
          id="change-request"
          rows={5}
          maxLength={4000}
          value={prompt}
          placeholder={
            intent === "create"
              ? "예: 아이콘, 제목, 설명이 있는 가격 카드를 만들어줘."
              : "예: 이 버튼을 크게 하고 아이콘을 추가해줘."
          }
          onChange={(e) => {
            setPrompt(e.target.value);
            setNotice("");
          }}
        />
        <p className="field-hint">
          The target is pinned above. Selecting another element does not
          silently change this request.
        </p>
        <button
          className="primary"
          disabled={!target || !prompt.trim()}
          onClick={save}
        >
          {editing ? "Update request" : "Add request"}
        </button>
        {editing && (
          <button
            className="small-apply"
            onClick={() => {
              setEditing(null);
              setPrompt("");
            }}
          >
            Cancel editing
          </button>
        )}
      </fieldset>
      {notice && (
        <p className="request-notice" role="status">
          {notice}
        </p>
      )}
      <div aria-label="Saved requests" className="request-list">
        <h3>
          Requests <span className="count">{requests.length}</span>
        </h3>
        {!requests.length && (
          <p className="field-hint">
            No requests yet. Your visual edits remain in the draft.
          </p>
        )}
        {requests.map((op) => {
          const request = parseComponentRequest(op.after);
          return (
            <article key={op.requestId}>
              <strong>
                {request.intent === "create"
                  ? "Create component"
                  : "Modify component"}
              </strong>
              <small>{op.targetId}</small>
              <p>{request.prompt}</p>
              <div>
                <button
                  disabled={disabled}
                  aria-label="Edit request"
                  onClick={() => {
                    setTarget(request.context);
                    setIntent(request.intent);
                    setPrompt(request.prompt);
                    setEditing(op.requestId);
                    setNotice("");
                  }}
                >
                  Edit
                </button>
                <button
                  disabled={disabled}
                  aria-label="Remove request"
                  onClick={() => {
                    remove(op);
                    if (editing === op.requestId) {
                      setEditing(null);
                      setPrompt("");
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="request-handoff">
        <button
          disabled={disabled || blocked || !requests.length}
          onClick={() => void copy()}
        >
          Copy for Codex / Claude
        </button>
        <button
          disabled={disabled || blocked || !requests.length}
          onClick={download}
        >
          Download AI request
        </button>
        <p className="field-hint">
          Includes requests, selected target snapshots and visual edits. This
          prepares a handoff; it does not run AI or modify source. Resolve draft
          conflicts before export.
        </p>
        {fallback && (
          <textarea
            aria-label="AI handoff text"
            rows={8}
            readOnly
            value={fallback}
            onFocus={(e) => e.target.select()}
          />
        )}
      </div>
    </section>
  );
}
