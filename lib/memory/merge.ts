// 仅对等价格式去重，不判断不同措辞是否同义。
// 日期、说话人和逐条证据必须保留。

// Keep semantic characters: 3.5 != 35, C++ != C, and positive != negative.
// This exact character set is also used by migration 0003.
export const KEY_IGNORED = " \t\r\n\u3000\u00a0，。、；：,;:\"“”‘’（）()《》〈〉【】[]{}…·";

export function statementKey(statement: string) {
  return [...statement].filter(char => !KEY_IGNORED.includes(char)).join("").replace(/[A-Z]/g, char => char.toLowerCase());
}

export function memoryIdentityKey(statement: string, occurredAt: string | null, role: string) {
  return `${statementKey(statement)}|date:${occurredAt || ""}|role:${role}`;
}

type DraftLike = {
  kind: string;
  statement: string;
  detail: string;
  quote: string;
  occurredAt: string | null;
  occurredPrecision: string;
};

export function mergeDrafts<T extends { draft: DraftLike }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    // Deduplicate identical evidence only. Never attach another quote's detail
    // or date to a span that did not support it.
    const key = JSON.stringify(item);
    const previous = seen.get(key);
    if (!previous) { seen.set(key, item); continue; }
    seen.set(key, previous);
  }
  return [...seen.values()];
}
