import { createHash, createHmac } from "node:crypto";

export type Channel = "email" | "phone";
export type Delivery = {
  available: (channel: Channel) => boolean;
  send: (channel: Channel, address: string, code: string, id: string) => Promise<void>;
};
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();

// Fixed provider endpoints; credentials never go to the browser or delivery logs.
export function createDelivery(env: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): Delivery {
  const available = (channel: Channel) => channel === "email"
    ? !!(env.RESEND_API_KEY?.trim() && env.AUTH_EMAIL_FROM?.trim())
    : [env.TENCENT_SMS_SECRET_ID, env.TENCENT_SMS_SECRET_KEY, env.TENCENT_SMS_APP_ID, env.TENCENT_SMS_SIGN_NAME, env.TENCENT_SMS_TEMPLATE_ID].every(value => !!value?.trim());
  return {
    available,
    async send(channel, address, code, id) {
      if (!available(channel)) throw new Error("Delivery is not configured");
      if (channel === "email") {
        const response = await transport("https://api.resend.com/emails", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `shiyan-verify-${id}` },
          body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [address], subject: "拾言登录验证码", text: `你的拾言验证码是：${code}。5分钟内有效，仅可使用一次。请勿向他人提供验证码。如非本人操作，请忽略此邮件。` }),
        });
        if (!response.ok || !(await response.json() as { id?: string }).id) throw new Error("Email delivery failed");
        return;
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const payload = JSON.stringify({ PhoneNumberSet: [address], SmsSdkAppId: env.TENCENT_SMS_APP_ID, SignName: env.TENCENT_SMS_SIGN_NAME, TemplateId: env.TENCENT_SMS_TEMPLATE_ID, TemplateParamSet: [code] });
      const canonical = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\n\ncontent-type;host\n${digest(payload)}`;
      const scope = `${date}/sms/tc3_request`;
      const key = hmac(hmac(hmac(`TC3${env.TENCENT_SMS_SECRET_KEY}`, date), "sms"), "tc3_request");
      const signature = createHmac("sha256", key).update(`TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${digest(canonical)}`).digest("hex");
      const response = await transport("https://sms.tencentcloudapi.com", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json; charset=utf-8", "X-TC-Action": "SendSms", "X-TC-Version": "2021-01-11", "X-TC-Region": "ap-guangzhou", "X-TC-Timestamp": String(timestamp), Authorization: `TC3-HMAC-SHA256 Credential=${env.TENCENT_SMS_SECRET_ID}/${scope}, SignedHeaders=content-type;host, Signature=${signature}` },
        body: payload,
      });
      if (!response.ok) throw new Error("SMS delivery failed");
      const result = await response.json() as { Response?: { Error?: unknown; SendStatusSet?: { Code?: string }[] } };
      if (result.Response?.Error || result.Response?.SendStatusSet?.length !== 1 || result.Response.SendStatusSet[0].Code !== "Ok") throw new Error("SMS delivery failed");
    },
  };
}
