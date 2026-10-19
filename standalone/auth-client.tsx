import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { APP_VERSION } from "../lib/version";

type Channel = "email" | "phone";
type Config = { channels: Channel[]; identities?: { channel: Channel; address: string }[]; owner?: boolean; publicEnabled?: boolean; setup?: { name: string; configured: boolean }[] };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error || "暂时无法完成，请稍后再试。");
  return value;
}
function Auth({ account }: { account: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; destination: string } | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const base = account ? "/api/account" : "/api/auth";
  async function load() {
    const value = await api<Config>(base + "/config");
    setConfig(value);
    setChannel(current => value.channels.includes(current) ? current : value.channels[0] || "email");
  }
  useEffect(() => { load().catch(error => setError(error.message)); }, []);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [deadline]);
  async function send() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ challengeId: string; destination: string; retryAfter: number }>(base + "/send", { channel, address });
      setChallenge(result); setCode(""); setDeadline(Date.now() + result.retryAfter * 1000);
      setMessage(`验证码已发送至 ${result.destination}，5分钟内有效。`);
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ location?: string; message?: string }>(base + "/verify", { challengeId: challenge?.challengeId, code });
      if (!account) { window.location.replace(result.location || "/"); return; }
      setMessage(result.message || "绑定成功。"); setChallenge(null); setCode(""); setAddress(""); await load();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const linked = config?.identities?.some(identity => identity.channel === channel);
  return <div className={`auth-layout ${account ? "account-layout" : ""}`}>
    {!account && <section className="auth-story"><a className="auth-brand" href="/login">拾言 <small>SHIYAN</small></a><p className="page-eyebrow">让每一次对话，都有所留。</p><h1>对话会结束，<br />思考可以留下。</h1><p>把散落在不同 AI 里的对话，整理成能随时回看的知识。</p><ol><li><b>带来对话</b><span>复制粘贴你想留下的内容</span></li><li><b>按话题收好</b><span>让同一个问题的思考聚在一起</span></li><li><b>读懂与回顾</b><span>保留细节的总结，还有每周回顾</span></li></ol><p className="auth-footnote">每个账号都有独立空间。你的原文和报告不会公开给其他用户。</p></section>}
    <section className="auth-card"><p className="page-eyebrow">{account ? "ACCOUNT" : "WELCOME TO SHIYAN"}</p><h1>{account ? "我的账号" : "开始留住你的思考。"}</h1><p className="auth-intro">{account ? "绑定手机和邮箱后，两种方式都能登录同一空间。" : "验证码登录，首次验证后会自动创建账号。"}</p>
      {account && <><a className="text-button" href="/">← 返回我的话题</a><ul className="account-identities">{config?.identities?.length ? config.identities.map(identity => <li key={identity.channel}><span>{identity.channel === "email" ? "邮箱" : "手机号"}</span><b>{identity.address}</b><small>已验证</small></li>) : <li>当前通过原空间密码登录，绑定后可用验证码回到这里。</li>}</ul></>}
      {!config && !error && <p role="status">正在读取登录方式…</p>}
      {config && <><div className="auth-tabs" aria-label="登录方式"><button type="button" aria-pressed={channel === "email"} disabled={busy} onClick={() => { setChannel("email"); setChallenge(null); setCode(""); setAddress(""); setError(""); setMessage(""); }}>邮箱验证码</button><button type="button" aria-pressed={channel === "phone"} disabled={busy} onClick={() => { setChannel("phone"); setChallenge(null); setCode(""); setAddress(""); setError(""); setMessage(""); }}>手机验证码</button></div>
        {!config.channels.includes(channel) ? <p className="auth-unavailable">{channel === "phone" ? "短信登录尚未开放。" : "邮箱登录尚未开放。"}{config.channels.includes(channel === "phone" ? "email" : "phone") ? "请使用另一种方式登录。" : "请稍后再来。"}</p> : linked ? <p className="auth-unavailable">此登录方式已经绑定，可以直接用于登录。</p> : <form onSubmit={verify}><label className="field">{channel === "email" ? "邮箱地址" : "手机号"}<div className="auth-address">{channel === "phone" && <span>+86</span>}<input aria-label={channel === "email" ? "邮箱地址" : "手机号"} type={channel === "email" ? "email" : "tel"} inputMode={channel === "email" ? "email" : "tel"} autoComplete={channel === "email" ? "email" : "tel-national"} value={address} disabled={busy} maxLength={254} required placeholder={channel === "email" ? "你的邮箱地址" : "中国大陆11位手机号"} onChange={event => { setAddress(event.target.value); setChallenge(null); setCode(""); setMessage(""); }} /></div></label><button className="button auth-send" type="button" onClick={send} disabled={busy || remaining > 0 || !address.trim()}>{remaining ? `${remaining}秒后可重发` : challenge ? "重新发送验证码" : "获取验证码"}</button>
          {challenge && <><label className="field">验证码<input ref={codeRef} aria-label="验证码" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} placeholder="6位数字验证码" required /></label><button className="button primary auth-submit" disabled={busy || code.length !== 6} type="submit">{busy ? "正在验证…" : account ? "验证并绑定" : "登录 / 注册"}</button></>}
        </form>}</>}
      {error && <p className="form-error auth-message" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}
      {account && config?.owner && <details className="auth-setup"><summary>管理员：登录服务配置</summary><p>在 Render 的拾言服务 Environment 中配置。密钥只保存在服务端。</p><ul>{config.setup?.map(item => <li key={item.name}><code>{item.name}</code><span>{item.configured ? "已配置" : "待配置"}</span></li>)}</ul><p>Resend 发件地址需要使用已验证域名；短信模板只包含一个验证码参数，正文注明5分钟有效。完成真实收码测试后，再将 APP_PUBLIC_SIGNUP 设置为 true 开放注册。</p><a className="text-button" href="https://dashboard.render.com/web/srv-dbadkqvbtjjs73eoft30/env" target="_blank" rel="noreferrer">打开 Render 配置 →</a></details>}
      {account && <form action="/logout" method="post"><button className="text-button auth-logout" type="submit">退出登录</button></form>}
      <p className="auth-footnote">{account ? "绑定不会合并其他账号中的对话。" : "你导入的对话只对自己可见。生成总结时，所选内容会发送至你配置的模型服务。"}<br />拾言 v{APP_VERSION}</p>
    </section></div>;
}
const root = document.getElementById("auth-root")!;
createRoot(root).render(<Auth account={root.dataset.account === "true"} />);
