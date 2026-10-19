export type Source = "ChatGPT" | "豆包" | "DeepSeek" | "其他";
export type Topic = {
  id: string; title: string; description: string; color: string;
  createdAt: string; updatedAt: string; count: number; sources: string[];
};
export type Conversation = {
  id: string; topicId: string; title: string; source: Source; content: string;
  conversationDate: string | null; importedAt: string;
};
export type SummaryItem = { text: string; sourceIds: string[] };
export type SummaryHighlight = SummaryItem & { title: string; details?: SummaryItem[]; steps?: SummaryItem[]; examples?: SummaryItem[]; caveats?: SummaryItem[] };
export type ModelInfo = { requestedModel: string; returnedModel: string | null; status: "matched" | "different" | "unreported" };
export type Summary = {
  overview: string;
  highlights: SummaryHighlight[];
  positions: SummaryItem[];
  questions: SummaryItem[];
  suggestions: SummaryItem[];
  uncertainty: string;
};
export type Report = {
  id: string; topicId: string; kind: "topic" | "week"; weekStart: string | null;
  summary: Summary; sourceIds: string[]; model: string; modelInfo?: ModelInfo; createdAt: string;
};
export type TopicDetail = { topic: Topic; conversations: Conversation[]; reports: Report[] };
