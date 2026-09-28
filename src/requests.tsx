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
      setNotice("요청을 추가했습니다. 파일에 보관하려면 편집안을 저장하세요.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function copy() {
    try {
      const text = buildHandoff(draft);
      await navigator.clipboard.writeText(text);
      setNotice("복사했습니다. Codex나 Claude에 붙여 넣어 구현을 요청하세요.");
      setFallback("");
    } catch {
      setFallback(buildHandoff(draft));
      setNotice("클립보드를 사용할 수 없습니다. 아래 내용을 직접 복사하세요.");
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
    setNotice("전달문을 다운로드했습니다. AI 작업은 시작하지 않았습니다.");
  }
  return (
    <section className="requests-panel" aria-label="컴포넌트 요청 목록">
      <h2>AI에게 수정 요청</h2>
      <p className="field-hint">
        화면에서 요소를 선택한 뒤 원하는 변경을 적어 주세요.
      </p>
      <fieldset disabled={disabled}>
        <div className="request-mode">
          <button onClick={onModify}>선택 요소 수정</button>
          <button onClick={onNew}>프레임 안에 생성</button>
        </div>
        <div className="request-target" aria-label="요청 대상">
          <strong>
            {intent === "create" ? "컴포넌트 생성" : "컴포넌트 수정"}
          </strong>
          <span>{target?.id ?? "먼저 컴포넌트를 선택하세요"}</span>
        </div>
        <label htmlFor="change-request">요청 내용</label>
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
          요청 대상은 위 요소로 고정됩니다. 다른 요소를 선택해도 바뀌지
          않습니다.
        </p>
        <button
          className="primary"
          disabled={!target || !prompt.trim()}
          onClick={save}
        >
          {editing ? "요청 수정" : "요청 추가"}
        </button>
        {editing && (
          <button
            className="small-apply"
            onClick={() => {
              setEditing(null);
              setPrompt("");
            }}
          >
            수정 취소
          </button>
        )}
      </fieldset>
      {notice && (
        <p className="request-notice" role="status">
          {notice}
        </p>
      )}
      <div aria-label="작성한 요청" className="request-list">
        <h3>
          요청 <span className="count">{requests.length}</span>
        </h3>
        {!requests.length && (
          <p className="field-hint">
            아직 요청이 없습니다. 화면에서 수정한 내용은 편집안에 유지됩니다.
          </p>
        )}
        {requests.map((op) => {
          const request = parseComponentRequest(op.after);
          return (
            <article key={op.requestId}>
              <strong>
                {request.intent === "create"
                  ? "컴포넌트 생성"
                  : "컴포넌트 수정"}
              </strong>
              <small>{op.targetId}</small>
              <p>{request.prompt}</p>
              <div>
                <button
                  disabled={disabled}
                  aria-label="요청 편집"
                  onClick={() => {
                    setTarget(request.context);
                    setIntent(request.intent);
                    setPrompt(request.prompt);
                    setEditing(op.requestId);
                    setNotice("");
                  }}
                >
                  편집
                </button>
                <button
                  disabled={disabled}
                  aria-label="요청 삭제"
                  onClick={() => {
                    remove(op);
                    if (editing === op.requestId) {
                      setEditing(null);
                      setPrompt("");
                    }
                  }}
                >
                  삭제
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
          Codex / Claude 전달문 복사
        </button>
        <button
          disabled={disabled || blocked || !requests.length}
          onClick={download}
        >
          AI 요청 다운로드
        </button>
        <p className="field-hint">
          요청, 대상 정보, 화면 변경 사항을 함께 전달합니다. AI 실행이나 코드
          수정은 시작하지 않습니다. 충돌을 해결한 뒤 내보내세요.
        </p>
        {fallback && (
          <textarea
            aria-label="AI 전달문"
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
