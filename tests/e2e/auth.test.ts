import { expect, test } from "@playwright/test";

test.describe("Authentication Pages", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Create account" })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("can navigate from login to register", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL("/register");
  });

  test("can navigate from register to login", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/login");
  });
});

test.describe("Personal management requires a signed-in account", () => {
  for (const section of ["connections", "skills"]) {
    test(`direct ${section} link goes to login without creating a guest`, async ({
      page,
    }) => {
      await page.goto(`/?section=${section}`);
      await expect(page).toHaveURL(
        `/login?next=${encodeURIComponent(`/?section=${section}`)}`
      );
      await expect(
        page.getByRole("heading", { name: "Welcome back" })
      ).toBeVisible();
      await expect(page.getByTestId(`personal-${section}`)).toHaveCount(0);
      const session = await page.request.get("/api/auth/session");
      expect((await session.json())?.user).toBeUndefined();
      await page.getByRole("link", { exact: true, name: "Sign up" }).click();
      await expect(page).toHaveURL(
        `/register?next=${encodeURIComponent(`/?section=${section}`)}`
      );
      await page.getByRole("link", { exact: true, name: "Sign in" }).click();
      await expect(page).toHaveURL(
        `/login?next=${encodeURIComponent(`/?section=${section}`)}`
      );
    });
  }

  test("guest sidebar exposes login and personal buttons lead straight to it", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("sidebar-login")).toBeVisible();
    await expect(page.getByTestId("user-nav-button")).toHaveCount(0);
    await page.getByRole("button", { exact: true, name: "技能" }).click();
    await expect(page).toHaveURL("/login?next=%2F%3Fsection%3Dskills");
    await expect(page.getByText("登录后可以管理个人技能。")).toHaveCount(0);
  });
});
