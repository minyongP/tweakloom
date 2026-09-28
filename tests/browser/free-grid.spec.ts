import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});
test("drops into an empty grid cell, moves independently, spans cells and restores history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "편집 보드", exact: false }).click();
  await page
    .getByRole("button", { name: "자유 그리드로 전환", exact: true })
    .click();
  const frame = page.frameLocator("iframe");
  const board = frame.locator("#draft-board");
  await board.scrollIntoViewIfNeeded();
  await expect(board).toHaveCSS("grid-auto-rows", "64px");
  const cell = async (column: number, row: number) => {
    const box = (await board.boundingBox())!;
    const dims = await board.evaluate((el) => {
      const c = getComputedStyle(el);
      return {
        x: el.clientLeft + parseFloat(c.paddingLeft),
        y: el.clientTop + parseFloat(c.paddingTop),
        w: parseFloat(c.gridTemplateColumns),
        h: parseFloat(c.gridTemplateRows),
        gap: parseFloat(c.gap),
      };
    });
    return {
      x: box.x + dims.x + (column - 1) * (dims.w + dims.gap) + dims.w / 2,
      y: box.y + dims.y + (row - 1) * (dims.h + dims.gap) + dims.h / 2,
    };
  };
  await page.getByRole("tab", { name: "추가", exact: true }).click();
  const source = (await page
    .getByLabel("오른쪽 컴포넌트 목록")
    .getByRole("button", { name: "버튼 추가", exact: true })
    .boundingBox())!;
  const at = await cell(5, 3);
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x - 25, source.y + 20, { steps: 5 });
  await page.mouse.move(at.x, at.y, { steps: 15 });
  await page.mouse.up();
  const button = board.locator('[data-tweakloom-preset="button"]');
  await expect(button).toHaveCSS("grid-column-start", "5");
  await expect(button).toHaveCSS("grid-row-start", "3");
  await page.getByLabel("차지할 열 수", { exact: true }).selectOption("span 3");
  await page
    .getByRole("button", { name: "차지할 열 수 적용", exact: true })
    .click();
  await page.getByLabel("차지할 행 수", { exact: true }).selectOption("span 2");
  await page
    .getByRole("button", { name: "차지할 행 수 적용", exact: true })
    .click();
  await page.getByRole("button", { name: "너비 채우기", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const start = (await button.boundingBox())!,
    next = await cell(2, 5);
  await page.mouse.move(start.x + 8, start.y + 8);
  await page.mouse.down();
  await page.mouse.move(next.x, next.y, { steps: 15 });
  await page.mouse.up();
  await expect(button).toHaveCSS("grid-column-start", "2");
  await expect(button).toHaveCSS("grid-row-start", "5");
  await expect(button).toHaveCSS("grid-column-end", "span 3");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(button).toHaveCSS("grid-column-start", "5");
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await page
    .getByRole("button", { name: "상위 프레임 배치 수정", exact: true })
    .click();
  await page.getByLabel("그리드 열 수", { exact: true }).selectOption("2");
  await expect(button).toHaveCSS("grid-column-start", "1");
  await expect(button).toHaveCSS("grid-column-end", "span 2");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(button).toHaveCSS("grid-column-start", "2");
  await expect(button).toHaveCSS("grid-column-end", "span 3");
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(button).toHaveCSS("grid-row-start", "5");
  await expect(button).toHaveCSS("grid-column-end", "span 3");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("inserts a free grid preset without changing the parent layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("드래그 방식").selectOption("flow");
  await page.getByLabel("그리드 가이드", { exact: true }).check();
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "자유 그리드 추가", exact: true })
    .click();
  const grid = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-preset="free-grid"]');
  await expect(grid).toHaveCSS("grid-auto-rows", "64px");
  await expect(grid).toHaveCSS("display", "grid");
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(grid).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
