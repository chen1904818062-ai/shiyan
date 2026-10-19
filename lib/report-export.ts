import type { SummaryHighlight, SummaryItem } from "./types";

export function highlightMarkdown(highlight: SummaryHighlight, item: (value: SummaryItem) => string) {
  const group = (label: string, values: SummaryItem[] | undefined, ordered = false) => values?.length ? `#### ${label}\n${values.map((value, i) => ordered ? item(value).replace(/^- /, `${i + 1}. `) : item(value)).join("\n\n")}` : "";
  return [`### ${highlight.title}`, item(highlight), group("具体内容", highlight.details), group("操作步骤", highlight.steps, true), group("原文中的例子", highlight.examples), group("适用条件与不同意见", highlight.caveats)].filter(Boolean).join("\n\n");
}
