// 归并：同一条记忆被多次提及时只保留一条，证据累积。
// 用归一化陈述作为键，避免「换一种说法就变成两条记忆」。

const PUNCTUATION = /[\s，。、；：！？,.;:!?、"“”‘’（）()《》〈〉【】\[\]{}—–…·~`@#$%^&*+=|\\/<>]/g;

export function statementKey(statement: string) {
  return statement.replace(PUNCTUATION, "").toLowerCase().slice(0, 200);
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
    const key = `${item.draft.kind}|${statementKey(item.draft.statement)}`;
    const previous = seen.get(key);
    if (!previous) { seen.set(key, item); continue; }
    const merged: T = { ...previous, draft: { ...previous.draft } };
    if (item.draft.detail.length > previous.draft.detail.length) merged.draft.detail = item.draft.detail;
    if (item.draft.occurredAt && (!merged.draft.occurredAt || item.draft.occurredAt < merged.draft.occurredAt)) {
      merged.draft.occurredAt = item.draft.occurredAt;
      merged.draft.occurredPrecision = item.draft.occurredPrecision;
    }
    seen.set(key, merged);
  }
  return [...seen.values()];
}
