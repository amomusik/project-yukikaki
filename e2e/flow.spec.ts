import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "./users";

/**
 * The whole loop, in order: owner files a brief (text fallback) → host approves →
 * student forms a team (lead) → host approves team → lead delivers → host sends
 * impact check (copy-link fallback) → owner answers once → impact total updates.
 */
test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36);
const businessName = `E2E Ramen ${stamp}`;
const teamName = `E2E Team ${stamp}`;
let impactLink = "";

async function signInAs(page: Page, who: keyof typeof E2E_USERS) {
  await page.goto("/ja");
  await clerk.signOut({ page }).catch(() => {});
  await clerk.signIn({ page, emailAddress: E2E_USERS[who].email });
}

async function ensureRole(page: Page, role: "business" | "student") {
  await page.goto("/ja/onboarding");
  if (page.url().includes("/onboarding")) {
    await page.locator(`input[name=role][value=${role}]`).check({ force: true });
    if (role === "student") {
      for (const s of ["line-bot", "booking-automation", "ai-automation"]) await page.locator(`input[name=skills][value=${s}]`).check({ force: true });
    }
    await page.getByRole("button", { name: "はじめる" }).click();
    await page.waitForURL(/\/(interview|challenges)/);
  }
}

test("landing renders in both languages; / defaults to English", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page).toHaveTitle("Yukikaki — Your test kitchen for hackathons.");
  await expect(page.getByRole("heading", { level: 1, name: "Project Yukikaki" })).toBeVisible();
  await expect(page.locator("h1")).toContainText("Yukikaki");
  await expect(page.getByRole("heading", { level: 2, name: "Builders are not the bottleneck." })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Your test kitchen for hackathons.");
  await expect(page.getByRole("combobox", { name: "Search challenges" })).toBeVisible();
  // The 8-bit scene is the default hero; ?hero=paper still opts into the paper-cut art.
  await expect(page.locator("section[data-hero]")).toHaveAttribute("data-hero", "pixel");
  await expect(page.locator("section[data-hero] img")).toHaveAttribute("src", /hero-pixel/);
  await page.goto("/en?hero=paper");
  await expect(page.locator("section[data-hero]")).toHaveAttribute("data-hero", "papercut");
  await expect(page.locator("section[data-hero] img")).toHaveAttribute("src", /hero-yukikaki/);
  await page.goto("/ja");
  await expect(page).toHaveTitle("雪かき Yukikaki — ハッカソンのための、まちのテストキッチン。");
  await expect(page.getByRole("heading", { level: 1, name: "Project Yukikaki" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "ボトルネックは、ビルダーではありません。" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("ハッカソンのための、まちのテストキッチン。");
});

test("owner files a brief with the text fallback; it lands in the host queue with grounding + fallbacks", async ({ page }) => {
  await signInAs(page, "owner");
  await ensureRole(page, "business");
  await page.goto("/ja/interview");
  await page.fill("#business_name", businessName);
  await page.fill("#industry", "ラーメン店");
  await page.fill("#city", "札幌");
  await page.fill("#problem", "予約の電話とLINEの返信に毎週6時間かかっている");
  await page.fill("#tools_used", "LINE, 紙のノート");
  await page.fill("#hours_lost_per_week", "6");
  await page.getByRole("button", { name: "送信する" }).click();
  await page.waitForURL(/\/ja\/me/);
  await expect(page.getByText(businessName).first()).toBeVisible();

  await signInAs(page, "host");
  await expect
    .poll(async () => {
      await page.goto("/ja/admin");
      return page.locator('[data-testid="brief-card"]', { hasText: businessName }).getByTestId("decision-form").count();
    }, { timeout: 120_000, intervals: [3_000] })
    .toBe(1);
  const card = page.locator('[data-testid="brief-card"]', { hasText: businessName });
  // With Linkup/Adaption keys unset, pre-baked reference data is used and labelled.
  await expect(card.getByText(/参考データ|根拠なし|類似都市|実データ/).first()).toBeVisible();
  await expect(page.getByTestId("service-status")).toBeVisible();

  await card.getByRole("button", { name: /承認/ }).click();
  // Wait for the server action to finish (the card leaves the review queue) before navigating.
  await expect(page.locator('[data-testid="brief-card"]', { hasText: businessName })).toHaveCount(0, { timeout: 60_000 });
  await page.goto("/ja/challenges");
  await expect(page.getByText(businessName).first()).toBeVisible();
});

test("student forms a team and is the lead; host approves; lead delivers", async ({ page }) => {
  await signInAs(page, "student");
  await ensureRole(page, "student");
  await page.goto("/ja/challenges");
  await page.getByText(businessName).first().click();
  await page.getByRole("link", { name: "チームを組んで挑戦する" }).click();
  await page.fill("#name", teamName);
  await page.fill("#pitch", "LINE公式アカウントの自動応答で予約を受け付けます");
  await page.getByRole("button", { name: "チームを作成" }).click();
  await expect(page.getByText("👑 リーダー")).toBeVisible();

  await signInAs(page, "host");
  await page.goto("/ja/admin?tab=teams");
  const teamCard = page.locator("div", { hasText: teamName }).filter({ has: page.getByRole("button", { name: /承認/ }) }).last();
  await teamCard.getByRole("button", { name: /承認/ }).click();
  await expect(page.getByText(teamName)).toHaveCount(0, { timeout: 60_000 }); // left the pending queue

  await signInAs(page, "student");
  await page.goto("/ja/me");
  await page.getByRole("link", { name: teamName }).click();
  await page.getByRole("link", { name: "納品する" }).click();
  await page.fill("#summaryJa", "LINEで予約を自動受付するボットを納品しました");
  await page.fill("#links", "https://github.com/example/line-booking-bot");
  await page.getByRole("button", { name: "納品を報告する" }).click();
  await expect(page.getByText(/サポート期限/)).toBeVisible();
});

test("host sends an impact check; the link works exactly once; impact total updates", async ({ page, browser }) => {
  await signInAs(page, "host");
  await page.goto("/ja/admin?tab=impact");
  const before = Number((await page.getByTestId("impact-total").innerText()).replace(/[^\d]/g, ""));

  await page.goto("/ja/admin?tab=deliveries");
  const card = page.locator('[data-testid="delivery-card"]', { hasText: teamName });
  await card.getByRole("button", { name: /効果アンケートを送る/ }).click();
  impactLink = (await card.getByTestId("impact-link").innerText()).trim();
  expect(impactLink).toMatch(/\/ja\/feedback\/[\w-]{40,}$/);

  const anon = await browser.newContext();
  const owner = await anon.newPage();
  await owner.goto(impactLink);
  await owner.fill("#hours", "5");
  await owner.getByRole("button", { name: "回答を送信" }).click();
  await expect(owner.getByTestId("feedback-thanks")).toBeVisible();
  await owner.goto(impactLink);
  await expect(owner.getByTestId("feedback-closed")).toContainText("回答済み");
  await anon.close();

  await page.goto("/ja/admin?tab=impact");
  await expect(page.getByTestId("impact-total")).toContainText(String(before + 5));
});
