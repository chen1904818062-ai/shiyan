export async function signIn(page, base) {
  await page.goto(base + "/signin-with-chatgpt?return_to=/");
  if (process.env.TEST_ACCESS_PASSWORD) {
    await page.getByLabel("测试访问密码", { exact: true }).fill(process.env.TEST_ACCESS_PASSWORD);
    await page.getByRole("button", { name: "进入私人空间" }).click();
    await page.waitForURL(base + "/");
  }
}
