import { test, expect } from "@playwright/test";
import { rm, readFile } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});

test("inserts components from both libraries, edits fonts and options, and restores them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  const preview = page.frameLocator("iframe");
  await page
    .getByLabel("왼쪽 컴포넌트 목록")
    .getByRole("button", { name: "제목 추가", exact: true })
    .click();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveText(
    "새로운 아이디어",
  );
  await page
    .getByLabel("글꼴 종류", { exact: true })
    .selectOption("Trebuchet MS, sans-serif");
  await page
    .getByRole("button", { name: "글꼴 종류 적용", exact: true })
    .click();
  await expect(page.getByLabel("글꼴 종류", { exact: true })).toHaveValue(
    "Trebuchet MS, sans-serif",
  );
  await page
    .getByRole("button", { name: "글꼴 종류 적용", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByLabel("글꼴 종류", { exact: true })
    .selectOption("Georgia, serif");
  await page
    .getByRole("button", { name: "글꼴 종류 적용", exact: true })
    .click();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "font-family",
    "Georgia, serif",
  );
  await page.getByRole("tab", { name: "추가", exact: true }).click();
  await page
    .getByLabel("오른쪽 컴포넌트 목록")
    .getByRole("button", { name: "드롭다운 추가", exact: true })
    .click();
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"]'),
  ).toBeVisible();
  await page.getByLabel("드롭다운 항목").fill("Small\nMedium\nLarge");
  await page.getByRole("button", { name: "항목 적용", exact: true }).click();
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"] option'),
  ).toHaveText(["Small", "Medium", "Large"]);
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(preview.locator('[data-tweakloom-preset="heading"]')).toHaveCSS(
    "font-family",
    "Georgia, serif",
  );
  await expect(
    preview.locator('[data-tweakloom-preset="dropdown"] option'),
  ).toHaveText(["Small", "Medium", "Large"]);
});

test("drags an existing component freely and keeps coordinates after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("드래그 방식")).toHaveValue("free");
  const title = page
    .frameLocator("iframe")
    .getByRole("heading", { name: "Make room for good work." });
  await title.scrollIntoViewIfNeeded();
  const box = (await title.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 107, box.y + 55, { steps: 8 });
  await page.mouse.up();
  await expect(title).toHaveCSS("translate", "67px 35px");
  await expect(page.getByLabel("X 위치")).toHaveValue("67");
  await expect(page.getByLabel("8px 격자", { exact: true })).not.toBeChecked();
  await expect(
    page.frameLocator("iframe").getByLabel("그리드 가이드", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(title).toHaveCSS("translate", "none");
  await title.click();
  await page.keyboard.press("ArrowRight");
  await expect(title).toHaveCSS("translate", "1px");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(title).toHaveCSS("translate", "1px 10px");
  await page.keyboard.press("Control+z");
  await expect(title).toHaveCSS("translate", "1px");
  await page.keyboard.press("Control+z");
  await expect(title).toHaveCSS("translate", "none");
  await page.getByLabel("8px 격자", { exact: true }).check();
  await title.scrollIntoViewIfNeeded();
  const reset = (await title.boundingBox())!;
  await page.mouse.move(reset.x + 40, reset.y + 20);
  await page.mouse.down();
  await page.mouse.move(reset.x + 107, reset.y + 55, { steps: 8 });
  await page.mouse.up();
  await expect(title).toHaveCSS("translate", "64px 32px");
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(title).toHaveCSS("translate", "64px 32px");
});

test("drags a component from the right library into the preview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("미리보기 연결됨", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "추가", exact: true }).click();
  await page.getByLabel("드래그 방식").selectOption("free");
  const target = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-id="hero-art"]');
  await target.scrollIntoViewIfNeeded();
  const source = await page
    .getByLabel("오른쪽 컴포넌트 목록")
    .getByRole("button", { name: "버튼 추가", exact: true })
    .boundingBox();
  const box = (await target.boundingBox())!;
  await page.mouse.move(source!.x + 30, source!.y + 25);
  await page.mouse.down();
  await page.mouse.move(source!.x - 30, source!.y + 25, { steps: 5 });
  await page.mouse.move(box.x + 70, box.y + 60, { steps: 15 });
  await page.mouse.up();
  await expect(
    page.frameLocator("iframe").locator('[data-tweakloom-preset="button"]'),
  ).toBeVisible();
  const placed = (await page
    .frameLocator("iframe")
    .locator('[data-tweakloom-preset="button"]')
    .boundingBox())!;
  expect(Math.abs(placed.x - box.x - 70)).toBeLessThan(2);
  expect(Math.abs(placed.y - box.y - 60)).toBeLessThan(2);
  await page.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(
    page.frameLocator("iframe").locator('[data-tweakloom-preset="button"]'),
  ).toHaveCount(0);
});

test("configures page and API actions without navigation or outgoing requests", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: /Find your essentials/ })
    .click();
  await page.getByRole("tab", { name: "동작", exact: true }).click();
  await page.getByLabel("동작 종류").selectOption("navigate");
  await page.getByLabel("이동 경로").fill("/checkout");
  await page.getByRole("button", { name: "동작 적용", exact: true }).click();
  await page.getByRole("button", { name: "동작 테스트", exact: true }).click();
  await expect(
    page.getByLabel("동작 미리보기 결과", { exact: true }),
  ).toContainText("/checkout");
  await page.getByLabel("동작 종류").selectOption("api");
  await page.getByLabel("API URL").fill("https://example.com/orders");
  await page.getByLabel("HTTP 메서드").selectOption("POST");
  await page.getByLabel("요청 본문 (JSON)").fill('{"quantity":2}');
  await page.getByLabel("모의 응답 (JSON)").fill('{"created":true}');
  let outgoing = false;
  page.on("request", (request) => {
    if (request.url().includes("example.com/orders")) outgoing = true;
  });
  await page.getByRole("button", { name: "동작 적용", exact: true }).click();
  await page.getByRole("button", { name: "동작 테스트", exact: true }).click();
  await expect(
    page.getByLabel("동작 미리보기 결과", { exact: true }),
  ).toContainText("created");
  expect(outgoing).toBe(false);
  expect(page.url()).toBe("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "편집안 저장", exact: true }).click();
  await expect(
    page.getByText("저장됨 · 버전 1", { exact: true }),
  ).toBeVisible();
  const draft = JSON.parse(await readFile(".tweakloom/e2e/draft.json", "utf8"));
  expect(
    JSON.parse(
      draft.operations.find((op: { kind: string }) => op.kind === "interaction")
        .after,
    ).method,
  ).toBe("POST");
});
