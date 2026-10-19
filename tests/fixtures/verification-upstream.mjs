// Loaded only by the test runner with --import. No debug code or OTP bypass is
// included in the production bundle or routes.
if (process.env.NODE_ENV !== "test" || !process.send) throw new Error("Test-only delivery fixture");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://api.resend.com/emails") {
    const value = JSON.parse(init.body);
    process.send({ channel: "email", address: value.to[0], code: value.text.match(/\d{6}/)[0] });
    return Response.json({ id: "test-email-accepted" });
  }
  if (url === "https://sms.tencentcloudapi.com") {
    const value = JSON.parse(init.body);
    process.send({ channel: "phone", address: value.PhoneNumberSet[0], code: value.TemplateParamSet[0] });
    return Response.json({ Response: { SendStatusSet: [{ Code: "Ok" }] } });
  }
  return original(input, init);
};
