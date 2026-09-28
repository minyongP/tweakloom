import { test, expect } from "@playwright/test";
import { rm, readFile } from "node:fs/promises";
test.beforeEach(async () => {
  await rm(".tweakloom/e2e", { recursive: true, force: true });
});
test("selects a component on screen, saves a request, edits it and exports a handoff", async ({
  page,
}) => {
  await page.goto("/");
  const preview = page.frameLocator("iframe");
  await preview.locator('[data-tweakloom-id="hero-title"]').click();
  await preview
    .getByRole("button", {
      name: "Ask AI about selected component",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("tab", { name: "Requests", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByLabel("Change request", { exact: true })
    .fill("제목을 두 줄로 정리하고 강조 단어를 보라색으로 바꿔줘.");
  await preview.locator('[data-tweakloom-id="hero-description"]').click();
  await expect(
    page.getByLabel("Request target", { exact: true }),
  ).toContainText("hero-title");
  await page.getByRole("button", { name: "Add request", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Saved · revision 1", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Requests", exact: true }).click();
  await page.getByRole("button", { name: "Edit request", exact: true }).click();
  await page
    .getByLabel("Change request", { exact: true })
    .fill("제목을 세 줄로 정리해줘.");
  await page
    .getByRole("button", { name: "Update request", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download AI request", exact: true })
    .click();
  const file = await download;
  const text = await readFile((await file.path())!, "utf8");
  expect(text).toContain("hero-title");
  expect(text).toContain("제목을 세 줄로 정리해줘.");
  expect(text).toContain("modify");
  expect(text).toContain("sourceFiles");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Saved requests")).toContainText(
    "제목을 두 줄로",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("creates a component request for a frame and preserves it through refresh", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Preview connected", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New component request", exact: true })
    .click();
  await expect(
    page.getByLabel("Request target", { exact: true }),
  ).toContainText("draft-board");
  await page
    .getByLabel("Change request", { exact: true })
    .fill("아이콘과 제목, 설명이 있는 가격 카드 컴포넌트를 만들어줘.");
  await page.getByRole("button", { name: "Add request", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Requests", exact: true }).click();
  await expect(page.getByLabel("Saved requests")).toContainText("가격 카드");
  await expect(page.getByLabel("Saved requests")).toContainText(
    "Create component",
  );
  await page
    .getByRole("button", { name: "Remove request", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download AI request", exact: true }),
  ).toBeDisabled();
});

test("copies an explicit request snapshot and blocks handoff when the target disappears", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const title = page
    .frameLocator("iframe")
    .locator('[data-tweakloom-id="hero-title"]');
  await title.click();
  await page
    .frameLocator("iframe")
    .getByRole("button", {
      name: "Ask AI about selected component",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Change request", { exact: true })
    .fill("Make this title a reusable component.");
  await page.getByRole("button", { name: "Add request", exact: true }).click();
  await page
    .getByRole("button", { name: "Copy for Codex / Claude", exact: true })
    .click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("Make this title a reusable component.");
  expect(clipboard).toContain("hero-title");
  await title.evaluate((element) => element.remove());
  await expect(page.getByRole("alert")).toContainText("missing target");
  await expect(
    page.getByRole("button", { name: "Download AI request", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Saved requests")).toContainText(
    "Make this title",
  );
});
