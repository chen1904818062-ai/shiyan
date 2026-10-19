import { APP_VERSION } from "../lib/version.ts";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Auth, { type AuthConfig } from "./auth-view.tsx";

const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function loginPage(error = "", action = "/login") {
  // Error text is selected by the server; no request content is embedded here.
  const safeError = error.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾言 · 原空间登录</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/auth.css?v=${APP_VERSION}"></head><body><main class="auth-card"><p class="page-eyebrow">SHIYAN</p><h1>欢迎回到拾言。</h1><p class="auth-intro">输入访问密码，打开你的思考空间。</p><form method="post" action="${action}"><label class="field">访问密码<input aria-label="访问密码" name="password" type="password" required maxlength="1000" autocomplete="current-password" autofocus></label>${safeError ? `<p class="form-error" role="alert">${safeError}</p>` : ""}<button class="button primary auth-submit" type="submit">进入私人空间</button></form><p class="auth-footnote">拾言 v${APP_VERSION}<br>原空间的内容仅由持有访问密码的你访问。</p></main></body></html>`;
}

export function accountPage(account = false, config: AuthConfig = { channels: [] }) {
  const content = renderToString(createElement(Auth, { account, initialConfig: config }));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾言 · ${account ? "我的账号" : "登录与注册"}</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/auth.css?v=${APP_VERSION}"><link rel="modulepreload" href="/assets/auth.js?v=${APP_VERSION}"></head><body><main id="auth-root" data-account="${account}" data-config="${escapeHTML(JSON.stringify(config))}">${content}</main><noscript><p class="auth-card">请开启 JavaScript 以获取并验证登录验证码。</p></noscript><script type="module" src="/assets/auth.js?v=${APP_VERSION}"></script></body></html>`;
}
