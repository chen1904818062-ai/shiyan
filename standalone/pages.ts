import { APP_VERSION } from "../lib/version.ts";

export function loginPage(error = "") {
  // Error text is selected by the server; no request content is embedded here.
  const safeError = error.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾言 · 私人空间登录</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/app.css"></head><body><main style="max-width:420px;margin:12vh auto;padding:28px"><p class="page-eyebrow">SHIYAN · PERSONAL</p><h1 style="font-size:30px;margin:12px 0">欢迎回到拾言。</h1><p style="color:#829172;margin-bottom:28px">输入访问密码，打开你的思考空间。</p><form method="post" action="/login"><label class="field">访问密码<input aria-label="访问密码" name="password" type="password" required maxlength="1000" autocomplete="current-password" autofocus></label>${safeError ? `<p class="form-error" role="alert">${safeError}</p>` : ""}<button class="button primary" style="width:100%;margin-top:12px" type="submit">进入私人空间</button></form><p style="font-size:11px;color:#a2ad95;margin-top:26px">拾言个人版 v${APP_VERSION}<br>访问密码由空间管理员设置。</p></main></body></html>`;
}
