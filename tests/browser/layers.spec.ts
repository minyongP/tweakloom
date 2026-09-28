import { test, expect } from "@playwright/test";
import { rm } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});
test("layer parent changes preserve position, detach from parent movement and survive history and reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator("iframe"),
    art = frame.locator('[data-tweakloom-id="hero-art"]'),
    parent = frame.locator('[data-tweakloom-id="hero-content"]');
  const rect = () =>
    art.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x + scrollX,
        y: r.y + scrollY,
        width: r.width,
        height: r.height,
      };
    });
  await page.getByRole("button", { name: "메인 이미지", exact: true }).click();
  const before = await rect();
  await page
    .getByLabel("소속 영역", { exact: true })
    .selectOption("hero-content");
  await expect(parent.locator('[data-tweakloom-id="hero-art"]')).toHaveCount(1);
  await expect(page.locator('[data-layer-id="hero-art"]')).toHaveAttribute(
    "aria-level",
    "2",
  );
  const nested = await rect();
  expect(Math.abs(nested.x - before.x)).toBeLessThan(2);
  expect(Math.abs(nested.y - before.y)).toBeLessThan(2);
  await page.getByRole("button", { name: "메인 영역", exact: true }).click();
  await page.getByLabel("X 위치", { exact: true }).fill("70");
  await page.getByLabel("Y 위치", { exact: true }).fill("25");
  await page.getByRole("button", { name: "위치 적용", exact: true }).click();
  await expect(parent).toHaveCSS("translate", "70px 25px");
  await expect
    .poll(async () => Math.round((await rect()).x - nested.x))
    .toBe(70);
  await page.getByRole("button", { name: "메인 이미지", exact: true }).click();
  const moved = await rect();
  await page
    .getByRole("button", { name: "부모에서 분리", exact: true })
    .click();
  await expect(
    frame.locator(
      '[data-tweakloom-id="page-root"] > [data-tweakloom-id="hero-art"]',
    ),
  ).toHaveCount(1);
  await expect(page.locator('[data-layer-id="hero-art"]')).toHaveAttribute(
    "aria-level",
    "1",
  );
  const detached = await rect();
  expect(Math.abs(detached.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(detached.y - moved.y)).toBeLessThan(2);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(parent.locator('[data-tweakloom-id="hero-art"]')).toHaveCount(1);
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(parent.locator('[data-tweakloom-id="hero-art"]')).toHaveCount(0);
  await page.getByRole("button", { name: "메인 영역", exact: true }).click();
  await page.getByLabel("X 위치", { exact: true }).fill("110");
  await page.getByRole("button", { name: "위치 적용", exact: true }).click();
  await expect(parent).toHaveCSS("translate", "110px 25px");
  expect(Math.abs((await rect()).x - detached.x)).toBeLessThan(2);
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    frame.locator(
      '[data-tweakloom-id="page-root"] > [data-tweakloom-id="hero-art"]',
    ),
  ).toHaveCount(1);
  expect(Math.abs((await rect()).x - detached.x)).toBeLessThan(2);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("layer list rejects cycles and supports drag reparenting", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "메인 영역", exact: true }).click();
  await expect(
    page.getByLabel("소속 영역").locator('option[value="hero-content"]'),
  ).toHaveCount(0);
  await page
    .locator('[data-layer-id="hero-content"]')
    .getByRole("button", { name: "하위 요소 접기", exact: true })
    .click();
  const image = page.locator('[data-layer-id="hero-art"] button.element');
  const target = page.locator('[data-layer-id="hero-content"] button.element');
  await image.dragTo(target);
  await expect(page.locator('[data-layer-id="hero-art"]')).toHaveAttribute(
    "data-parent-id",
    "hero-content",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
