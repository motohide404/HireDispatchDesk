import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";

// Exercise real UI and serialization against an in-memory API. Every workspace
// PUT also runs the production Python validator; no deployed DB is modified.
async function connectTestApi(page: Page) {
  let value: any = null;
  let revision = 0;
  const files = new Map<string, Buffer>();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/workspace") {
      if (request.method() === "PUT") {
        const payload = request.postDataJSON();
        const validation = spawnSync("python3", ["-c", "import sys,json;sys.path.insert(0,'../tests');from test_validation import app;app.validate(json.load(sys.stdin))"], { input: JSON.stringify(payload.value), encoding: "utf8" });
        if (validation.status !== 0) { await route.fulfill({ status: 400, json: { error: validation.stderr } }); return; }
        if (payload.revision !== revision) { await route.fulfill({ status: 409, json: { error: "更新競合" } }); return; }
        value = payload.value; revision++;
        await route.fulfill({ json: { revision } }); return;
      }
      await route.fulfill({ json: { value, revision } }); return;
    }
    if (url.pathname === "/api/files" && request.method() === "POST") {
      const id = (files.size + 1).toString(16).padStart(32, "0");
      files.set(id, request.postDataBuffer()!);
      await route.fulfill({ status: 201, json: { id, name: decodeURIComponent(request.headers()["x-filename"]), url: `/api/files/${id}`, addedAt: new Date().toISOString() } }); return;
    }
    const content = files.get(url.pathname.split("/").pop()!);
    if (content) { await route.fulfill({ contentType: "image/png", body: content }); return; }
    await route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "運転者台帳", exact: true })).toBeVisible();
  return { get value() { return value; }, errors };
}

async function saved(page: Page) { await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); }
async function openDriver(page: Page, name = "田中 太郎") {
  await page.getByRole("button", { name: "運転者台帳", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

test("photo, assessment history, next due dates and edits survive reload and stay with their driver", async ({ page }) => {
  const state = await connectTestApi(page);
  await openDriver(page);
  const image = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await page.getByLabel("顔写真を選択").setInputFiles({ name: "test-portrait.png", mimeType: "image/png", buffer: image });
  await page.getByRole("button", { name: "確認へ進む", exact: true }).click();
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.getByAltText("田中 太郎の顔写真", { exact: true })).toBeVisible();
  await expect.poll(() => page.getByAltText("田中 太郎の顔写真", { exact: true }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(8);
  await page.getByLabel("受診日", { exact: true }).fill("2026-01-10");
  await page.getByLabel("次回予定日", { exact: true }).fill("2027-01-10");
  await page.getByLabel("受診機関").fill("テスト診断センター");
  await page.getByLabel("結果・所見・対応メモ").fill("経過確認の記録");
  await page.getByRole("button", { name: "受診記録を保存", exact: true }).click();
  await saved(page);
  expect(state.value.drivers[0].aptitudeRecords).toHaveLength(1);
  await page.reload(); await openDriver(page);
  await expect(page.getByAltText("田中 太郎の顔写真", { exact: true })).toBeVisible();
  await expect(page.getByText(/次回適性診断：2027-01-10/).last()).toBeVisible();
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await page.getByLabel("次回予定日", { exact: true }).fill("2027-02-10");
  await page.getByRole("button", { name: "受診記録を更新", exact: true }).click();
  await saved(page);
  expect(state.value.drivers[0].aptitudeRecords).toHaveLength(1);
  expect(state.value.drivers[0].aptitudeRecords[0].nextDueAt).toBe("2027-02-10");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await openDriver(page, "佐藤 花子");
  await expect(page.getByText("写真未登録", { exact: true })).toBeVisible();
  await expect(page.getByText("受診記録はまだありません。", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("custom vehicle classes can be created, edited, reloaded and shown on dispatch", async ({ page }) => {
  const state = await connectTestApi(page);
  await page.getByRole("button", { name: "車両台帳", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "セダンA" }).click();
  await page.getByLabel("車両区分", { exact: true }).fill("ジャンボハイヤー（9人乗り）");
  await page.getByRole("button", { name: "車両区分を保存", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: /車両を追加/ }).click();
  await page.getByLabel("車両名", { exact: true }).fill("テスト車両");
  await page.getByLabel("管理ID", { exact: true }).fill("TEST-001");
  await page.getByLabel("車両区分", { exact: true }).fill("特別仕様車");
  await page.getByLabel("乗車定員", { exact: true }).fill("6");
  await page.getByLabel("ナンバー", { exact: true }).fill("品川300 あ 168");
  await page.getByRole("button", { name: "保存する", exact: true }).click();
  await saved(page);
  await page.reload();
  await page.getByRole("button", { name: "車両台帳", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: "セダンA" })).toContainText("ジャンボハイヤー（9人乗り）");
  await expect(page.getByRole("row").filter({ hasText: "テスト車両" })).toContainText("特別仕様車");
  expect(state.value.vehicles.find((v: any) => v.vehiclesId === "TEST-001").plateNo).toBe("品川300 あ 168");
  await page.getByRole("button", { name: "配車ボード", exact: true }).click();
  await expect(page.getByText("テスト車両", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("partner tariffs preserve yen and percent conditions, edits, and partner isolation", async ({ page }) => {
  const state = await connectTestApi(page);
  await page.getByRole("button", { name: "取引先", exact: true }).click();
  const panel = page.getByRole("region", { name: "取引先別タリフ" });
  await panel.getByRole("button", { name: "タリフを追加", exact: true }).click();
  await panel.getByLabel("タリフ名（必須）", { exact: true }).fill("空港送迎・冬季");
  await panel.getByLabel("車両区分", { exact: true }).fill("アルファード");
  await panel.getByLabel("基本料金（円・空欄は都度見積）", { exact: true }).fill("35000");
  await panel.getByLabel("基本料金の税区分", { exact: true }).selectOption("included");
  const discount = panel.getByRole("group", { name: "値引き", exact: true });
  await discount.getByLabel("単位", { exact: true }).selectOption("yen");
  await discount.getByLabel("金額（円）", { exact: true }).fill("1500");
  const kickback = panel.getByRole("group", { name: "キックバック", exact: true });
  await kickback.getByLabel("単位", { exact: true }).selectOption("percent");
  await kickback.getByLabel("率（%）", { exact: true }).fill("12.34");
  await panel.getByLabel("条件・計算基準の補足", { exact: true }).fill("高速代は対象外");
  await panel.getByRole("button", { name: "タリフを保存", exact: true }).click();
  await saved(page);
  await expect(panel).toContainText("35,000円");
  await expect(panel).toContainText("1,500円");
  await expect(panel).toContainText("12.34%");
  await page.reload(); await page.getByRole("button", { name: "取引先", exact: true }).click();
  await panel.getByRole("button", { name: "編集", exact: true }).click();
  await panel.getByLabel("基本料金（円・空欄は都度見積）", { exact: true }).fill("36000");
  await panel.getByRole("button", { name: "タリフを保存", exact: true }).click(); await saved(page);
  expect(state.value.partners[0].tariffs).toHaveLength(1);
  expect(state.value.partners[0].tariffs[0].baseFare).toBe(36000);
  await page.getByRole("button", { name: /グローブリンク/ }).click();
  await expect(panel).toContainText("タリフはまだ登録されていません。");
  expect(state.errors).toEqual([]);
});

test("tablet and narrow layouts keep tariff actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await connectTestApi(page);
  await page.getByRole("button", { name: "取引先", exact: true }).click();
  await page.getByRole("button", { name: "タリフを追加", exact: true }).click();
  await expect(page.getByLabel("タリフ名（必須）", { exact: true })).toBeVisible();
  await page.getByLabel("タリフ名（必須）", { exact: true }).fill("都度見積の条件");
  await page.getByRole("button", { name: "タリフを保存", exact: true }).click();
  await saved(page);
  await expect(page.getByRole("region", { name: "取引先別タリフ" })).toContainText("都度見積");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
