import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { APP_VERSION } from "../lib/version";

type Channel = "email" | "phone";
export type AuthConfig = { channels: Channel[]; identities?: { channel: Channel; address: string }[]; owner?: boolean; publicEnabled?: boolean; setup?: { name: string; configured: boolean }[] };
type Challenge = { challengeId: string; destination: string; resendAt: number; expiresAt: number; code: string };
type Action = "sending" | "verifying" | "redirecting" | null;
const canonical = (channel: Channel, address: string) => `${channel}:${channel === "email" ? address.trim().toLowerCase() : address.replace(/[\s-]/g, "").replace(/^\+86/, "")}`;

async function api<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) });
  let value: T & { error?: string };
  try { value = await response.json() as T & { error?: string }; }
  catch { throw new Error("服务暂时没有响应，请稍后重试。"); }
  if (!response.ok) throw new Error(value.error || "暂时无法完成，请稍后再试。");
  return value;
}
function Activity({ children, active }: { children: ReactNode; active: boolean }) {
  return <>{active && <span className="auth-spinner" aria-hidden="true" />}{children}</>;
}

export default function Auth({ account, initialConfig }: { account: boolean; initialConfig: AuthConfig }) {
  const [config, setConfig] = useState(initialConfig);
  const [channel, setChannel] = useState<Channel>(initialConfig.channels[0] || "email");
  const [drafts, setDrafts] = useState<Record<Channel, string>>({ email: "", phone: "" });
  const [records, setRecords] = useState<Record<string, Challenge>>({});
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [interactive, setInteractive] = useState(false);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const base = account ? "/api/account" : "/api/auth";
  const address = drafts[channel];
  const key = canonical(channel, address);
  const challenge = records[key];
  const hasChallenge = !!challenge && !editing;
  const remaining = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;
  const expired = !!challenge && now > 0 && challenge.expiresAt <= now;
  const linked = config.identities?.some(identity => identity.channel === channel);
  const available = config.channels.includes(channel);
  const busy = action !== null;

  useEffect(() => { setInteractive(true); return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const lastDeadline = Math.max(0, ...Object.values(records).map(record => record.expiresAt));
  useEffect(() => {
    if (!lastDeadline) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= lastDeadline) clearInterval(timer); }, 1000);
    const update = () => setNow(Date.now());
    update(); document.addEventListener("visibilitychange", update);
    if (lastDeadline <= Date.now()) clearInterval(timer);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [lastDeadline]);
  useEffect(() => { if (hasChallenge && available && !linked) codeRef.current?.focus(); }, [channel, challenge?.challengeId, hasChallenge, available, linked]);

  function changeChannel(next: Channel) {
    setChannel(next); setEditing(false); setError(""); setMessage(""); setNow(Date.now());
  }
  function updateCode(value: string) {
    setRecords(current => ({ ...current, [key]: { ...current[key], code: value.normalize("NFKC").replace(/\D/g, "").slice(0, 6) } }));
    setError("");
  }
  async function perform(kind: "sending" | "verifying", operation: (signal: AbortSignal) => Promise<boolean | void>) {
    if (lock.current) return;
    lock.current = true; setAction(kind); setError(""); setMessage("");
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), 30_000);
    let navigating = false;
    try { navigating = await operation(controller.signal) === true; }
    catch (error) {
      if (mounted.current) setError(controller.signal.aborted ? "请求等待较久，请稍后重试。" : error instanceof TypeError ? "网络暂时不稳定，请检查连接后重试。" : (error as Error).message);
    } finally {
      clearTimeout(timer);
      if (mounted.current && !navigating) { lock.current = false; setAction(null); }
    }
  }
  async function send(value = address) {
    if (channel === "phone" && !/^1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, "").replace(/^\+86/, ""))) { setError("请填写中国大陆11位手机号。"); addressRef.current?.focus(); return; }
    const target = canonical(channel, value);
    if ((records[target]?.resendAt || 0) > Date.now()) { setNow(Date.now()); return; }
    const started = Date.now();
    await perform("sending", async signal => {
      const result = await api<{ challengeId: string; destination: string; retryAfter: number; expiresIn: number }>(base + "/send", { channel, address: value }, signal);
      setDrafts(current => ({ ...current, [channel]: value }));
      setRecords(current => ({ ...current, [target]: { ...result, code: "", resendAt: Date.now() + result.retryAfter * 1000, expiresAt: started + result.expiresIn * 1000 } }));
      setEditing(false); setNow(Date.now());
      if (!account) for (const asset of ["app.js", "app.css"]) {
        if (document.querySelector(`link[data-workspace-asset="${asset}"]`)) continue;
        const link = document.createElement("link"); link.rel = "prefetch"; link.href = `/assets/${asset}?v=${APP_VERSION}`; link.dataset.workspaceAsset = asset; document.head.appendChild(link);
      }
    });
  }
  async function verify() {
    if (!challenge || expired || challenge.code.length !== 6) return;
    await perform("verifying", async signal => {
      const result = await api<{ location?: string; message?: string }>(base + "/verify", { challengeId: challenge.challengeId, code: challenge.code }, signal);
      if (!account) { setAction("redirecting"); window.location.replace("/"); return true; }
      setConfig(current => ({ ...current, identities: [...(current.identities || []), { channel, address: challenge.destination }] }));
      setMessage(result.message || "绑定成功，下次可使用此方式登录。");
      setRecords(current => { const next = { ...current }; delete next[key]; return next; });
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasChallenge) { void verify(); return; }
    const value = addressRef.current?.value || address;
    setDrafts(current => ({ ...current, [channel]: value }));
    const previous = records[canonical(channel, value)];
    if (previous && previous.expiresAt > Date.now()) { setEditing(false); setNow(Date.now()); return; }
    void send(value);
  }

  return <div className={`auth-layout ${account ? "account-layout" : ""}`}>
    {!account && <section className="auth-story"><a className="auth-brand" href="/login">拾言 <small>SHIYAN</small></a><p className="page-eyebrow">让每一次对话，都有所留。</p><h1>对话会结束，<br />思考可以留下。</h1><p>把散落在不同 AI 里的对话，整理成能随时回看的知识。</p><ol><li><b>带来对话</b><span>复制粘贴你想留下的内容</span></li><li><b>按话题收好</b><span>让同一个问题的思考聚在一起</span></li><li><b>读懂与回顾</b><span>保留细节的总结，还有每周回顾</span></li></ol><p className="auth-footnote">每个账号都有独立空间。你的原文和报告不会公开给其他用户。</p></section>}
    <section className="auth-card"><p className="page-eyebrow">{account ? "ACCOUNT" : "WELCOME TO SHIYAN"}</p><h1>{account ? "我的账号" : "开始留住你的思考。"}</h1><p className="auth-intro">{account ? "绑定手机和邮箱后，两种方式都能登录同一空间。" : "验证码登录，首次验证后会自动创建账号。"}</p>
      {account && <><a className="text-button" href="/">← 返回我的话题</a><ul className="account-identities">{config.identities?.length ? config.identities.map(identity => <li key={identity.channel}><span>{identity.channel === "email" ? "邮箱" : "手机号"}</span><b>{identity.address}</b><small>已验证</small></li>) : <li>当前通过原空间密码登录，绑定后可用验证码回到这里。</li>}</ul></>}
      <div className="auth-tabs" role="group" aria-label="登录方式">{(["email", "phone"] as const).map(item => <button key={item} type="button" aria-pressed={channel === item} disabled={busy || !interactive} onClick={() => changeChannel(item)}>{item === "email" ? "邮箱验证码" : "手机验证码"}{!config.channels.includes(item) && <small>暂未开放</small>}</button>)}</div>
      <div className="auth-flow" aria-busy={busy}>
        {!available ? <div className="auth-step auth-unavailable" key={channel}><p>{channel === "phone" ? "短信登录尚未开放。" : "邮箱登录尚未开放。"}</p>{config.channels.some(item => item !== channel) ? <button type="button" className="text-button" onClick={() => changeChannel(config.channels[0])}>使用{config.channels[0] === "email" ? "邮箱" : "手机"}登录 →</button> : <p>请稍后再来。</p>}</div> : linked ? <div className="auth-step auth-unavailable"><p>此登录方式已经绑定，可以直接用于登录。</p></div> : <form method="post" action={account ? "/account" : "/login"} onSubmit={submit} className={`auth-step ${hasChallenge ? "code-step" : ""}`} key={`${channel}:${hasChallenge ? "code" : "address"}`}>
          {!hasChallenge ? <><label className="field">{channel === "email" ? "邮箱地址" : "手机号"}<div className="auth-address">{channel === "phone" && <span>+86</span>}<input ref={addressRef} aria-label={channel === "email" ? "邮箱地址" : "手机号"} name="address" type={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} autoComplete={channel === "email" ? "email" : "tel-national"} autoCapitalize="none" spellCheck={false} defaultValue={address} disabled={busy} maxLength={254} pattern={channel === "email" ? "[^\\s@]+@[^\\s@]+\\.[^\\s@]+" : undefined} required placeholder={channel === "email" ? "你的邮箱地址" : "中国大陆11位手机号"} onChange={event => { setDrafts(current => ({ ...current, [channel]: event.target.value })); setError(""); setMessage(""); }} /></div></label><button className="button primary auth-submit" type="submit" disabled={!interactive || busy || (!!challenge && expired && remaining > 0)}><Activity active={action === "sending"}>{action === "sending" ? "正在发送…" : challenge && !expired ? "继续验证" : "获取验证码"}</Activity></button><p className="auth-hint">{channel === "email" ? "输入邮箱后，按回车也可以获取验证码。" : "仅支持中国大陆 +86 手机号。"}</p></> : <>
            <div className="auth-destination"><span>验证码已发送至<strong>{challenge.destination}</strong></span><button type="button" className="text-button" disabled={busy} onClick={() => { setEditing(true); setError(""); }}>更换{channel === "email" ? "邮箱" : "手机号"}</button></div>
            <label className="field">验证码<input ref={codeRef} className="auth-code" aria-label="验证码" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={challenge.code} onChange={event => updateCode(event.target.value)} onPaste={event => { const pasted = event.clipboardData.getData("text").normalize("NFKC").replace(/\s/g, "").match(/(?<!\d)\d{6}(?!\d)/)?.[0]; if (pasted) { event.preventDefault(); updateCode(pasted); } }} disabled={busy} placeholder="6位数字验证码" required aria-describedby="auth-code-hint" /></label>
            <button className="button primary auth-submit" disabled={busy || expired || challenge.code.length !== 6} type="submit"><Activity active={action === "verifying" || action === "redirecting"}>{action === "redirecting" ? "正在进入你的空间…" : action === "verifying" ? "正在验证…" : account ? "验证并绑定" : "登录 / 注册"}</Activity></button>
            <div className="auth-resend"><span id="auth-code-hint">{expired ? "验证码已过期" : "5分钟内有效"}</span><button className="text-button" type="button" onClick={() => void send()} disabled={busy || remaining > 0}>{action === "sending" ? "正在发送…" : remaining ? `${remaining}秒后可重发` : "重新发送验证码"}</button></div><p className="auth-hint">{expired ? "请重新获取验证码后继续。" : channel === "email" ? "没收到邮件？也可以看看垃圾邮件文件夹。" : "请留意手机短信。"}</p>
          </>}
        </form>}
        <div className="auth-feedback">{error && <p className="form-error auth-message" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}</div>
      </div>
      {account && config.owner && <details className="auth-setup"><summary>管理员：登录服务配置</summary><p>在 Render 的拾言服务 Environment 中配置。密钥只保存在服务端。</p><ul>{config.setup?.map(item => <li key={item.name}><code>{item.name}</code><span>{item.configured ? "已配置" : "待配置"}</span></li>)}</ul><p>公开登录{config.publicEnabled ? "已开放" : "尚未开放"}。完成真实收码测试后，再开放已配置的登录方式。</p><a className="text-button" href="https://dashboard.render.com/web/srv-dbadkqvbtjjs73eoft30/env" target="_blank" rel="noreferrer">打开 Render 配置 →</a></details>}
      {account && <form action="/logout" method="post"><button className="text-button auth-logout" type="submit">退出登录</button></form>}
      <p className="auth-footnote">{account ? "绑定不会合并其他账号中的对话。" : "你导入的对话只对自己可见。生成总结时，所选内容会发送至你配置的模型服务。"}<br />拾言 v{APP_VERSION}</p>
    </section></div>;
}
