import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("auto layout inserts without offsets, reorders, wraps and restores after save", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("드래그 방식")).toHaveValue("flow");
  const library = page.getByLabel("왼쪽 컴포넌트 목록");
  const board = page.frameLocator("iframe").locator("#draft-board");
  await library.getByRole("button", { name: "버튼 추가", exact: true }).click();
  await library.getByRole("button", { name: "제목 추가", exact: true }).click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "button");
  await page.getByRole("button", { name: "앞으로 이동", exact: true }).click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(board.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "translate",
    "none",
  );
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "button");
  await page.getByRole("button", { name: /편집 보드/ }).click();
  await page.getByRole("button", { name: "세로 배치", exact: true }).click();
  await expect(board).toHaveCSS("flex-direction", "column");
  const a = (await board
    .locator('[data-tweakloom-preset="button"]')
    .boundingBox())!;
  const b = (await board
    .locator('[data-tweakloom-preset="heading"]')
    .boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height + 17);
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(board).toHaveCSS("flex-direction", "column");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moves source siblings by dragging and restores exact order on Undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  const preview = page.frameLocator("iframe");
  const title = preview.locator('[data-tweakloom-id="hero-title"]');
  const target = preview.locator('[data-tweakloom-id="eyebrow"]');
  await title.scrollIntoViewIfNeeded();
  const a = (await title.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + 2, { steps: 10 });
  await expect(preview.getByLabel("삽입 위치 가이드")).toBeVisible();
  await page.mouse.up();
  await expect(
    preview
      .locator('[data-tweakloom-id="hero-content"] > [data-tweakloom-id]')
      .first(),
  ).toHaveAttribute("data-tweakloom-id", "hero-title");
  await expect(title).toHaveCSS("translate", "none");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(
    preview
      .locator('[data-tweakloom-id="hero-content"] > [data-tweakloom-id]')
      .first(),
  ).toHaveAttribute("data-tweakloom-id", "eyebrow");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("container rules reject controls in a card collection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  await page.getByRole("button", { name: /카드 목록/ }).click();
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "버튼 추가", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("허용됩니다");
  await expect(
    page.frameLocator("iframe").locator('[data-tweakloom-preset="button"]'),
  ).toHaveCount(0);
});

test("drops new components into flow and moves them into a frame without losing order", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  const library = page.getByLabel("오른쪽 컴포넌트 목록");
  const preview = page.frameLocator("iframe"),
    board = preview.locator("#draft-board");
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "버튼 추가", exact: true })
    .click();
  await page.getByRole("tab", { name: "추가", exact: true }).click();
  await board.scrollIntoViewIfNeeded();
  const first = board.locator('[data-tweakloom-preset="button"]');
  const source = (await library
    .getByRole("button", { name: "제목 추가", exact: true })
    .boundingBox())!;
  const target = (await first.boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x - 25, source.y + 20, { steps: 5 });
  await page.mouse.move(target.x + 2, target.y + 10, { steps: 15 });
  await page.mouse.up();
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(first).toHaveCSS("translate", "none");
  await page.getByRole("button", { name: /편집 보드/ }).click();
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "프레임 추가", exact: true })
    .click();
  const frame = board.locator('[data-tweakloom-preset="frame"]');
  await frame.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!,
    b = (await frame.boundingBox())!;
  await page.mouse.move(a.x + 10, a.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 15 });
  await page.mouse.up();
  await expect(frame.locator('[data-tweakloom-preset="button"]')).toHaveCount(
    1,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(frame.locator('[data-tweakloom-preset="button"]')).toHaveCount(
    1,
  );
  await expect(
    board.locator(":scope > [data-tweakloom-preset]").first(),
  ).toHaveAttribute("data-tweakloom-preset", "heading");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("moving a source element into a draft frame survives reload and frame removal restores it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  const preview = page.frameLocator("iframe"),
    title = preview.locator('[data-tweakloom-id="hero-title"]');
  await title.click();
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "프레임 추가", exact: true })
    .click();
  const frame = preview.locator('[data-tweakloom-preset="frame"]');
  const id = (await frame.getAttribute("data-tweakloom-id"))!;
  await title.scrollIntoViewIfNeeded();
  const a = (await title.boundingBox())!,
    b = (await frame.boundingBox())!;
  await page.mouse.move(a.x + 20, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 35, { steps: 20 });
  await page.mouse.up();
  await expect(frame.locator('[data-tweakloom-id="hero-title"]')).toHaveCount(
    1,
  );
  await page.getByLabel("글자색", { exact: true }).fill("#123456");
  await page.getByRole("button", { name: "글자색 적용", exact: true }).click();
  await expect(title).toHaveCSS("color", "rgb(18, 52, 86)");
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(frame.locator('[data-tweakloom-id="hero-title"]')).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: `변경 삭제 ${id}:insert`, exact: true })
    .click();
  await expect(
    preview.locator(
      '[data-tweakloom-id="hero-content"] > [data-tweakloom-id="hero-title"]',
    ),
  ).toHaveCount(1);
  await expect(title).toHaveCSS("color", "rgb(18, 52, 86)");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
