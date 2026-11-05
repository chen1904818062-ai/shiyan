// Bound bytes while streaming, rather than after response.text()/json() has
// already allocated an arbitrarily large provider response.
export async function upstreamJson(response: Response, limit = 1_000_000): Promise<unknown> {
  if (!response.body) throw new Error("Missing upstream body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > limit) throw new Error("Upstream body too large");
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Upstream body too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(()=>undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
