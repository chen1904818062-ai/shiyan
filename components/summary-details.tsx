import type { SummaryHighlight, SummaryItem, ModelInfo } from "@/lib/types";
import { modelIdentityText } from "@/lib/model-response";
import type { ReactNode } from "react";

export function SummaryDetails({ highlight, references }: { highlight: SummaryHighlight; references: (ids: string[]) => ReactNode }) {
  const group = (label: string, items: SummaryItem[] | undefined, ordered = false) => {
    if (!items?.length) return null;
    const List = ordered ? "ol" : "ul";
    return <div className="summary-detail-group"><h5>{label}</h5><List>{items.map((item, index) => <li key={index}><p>{item.text}</p>{references(item.sourceIds)}</li>)}</List></div>;
  };
  return <div className="summary-details">{group("具体内容", highlight.details)}{group("操作步骤", highlight.steps, true)}{group("原文中的例子", highlight.examples)}{group("适用条件与不同意见", highlight.caveats)}</div>;
}

export function ModelIdentity({ info, model }: { info?: ModelInfo; model: string }) {
  return <div className={`model-identity ${info?.status === "different" ? "different" : ""}`} aria-label="模型调用记录"><span>{modelIdentityText(info, model)}</span></div>;
}
