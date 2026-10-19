// Prefer a supported precompressed representation without accepting q=0.
export function assetEncoding(header: string): "br" | "gzip" | undefined {
  const accepted = new Map<string, number>();
  for (const item of header.toLowerCase().split(",")) {
    const [name, ...parameters] = item.trim().split(";");
    if (!name) continue;
    const quality = parameters.find(value => value.trim().startsWith("q="));
    const value = quality ? Number(quality.trim().slice(2)) : 1;
    accepted.set(name.trim(), Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0);
  }
  const candidates = (["br", "gzip"] as const).map(name => ({ name, q: accepted.get(name) ?? accepted.get("*") ?? 0 })).filter(value => value.q > 0).sort((a, b) => b.q - a.q);
  return candidates.length && (accepted.get("identity") ?? 0) <= candidates[0].q ? candidates[0].name : undefined;
}
