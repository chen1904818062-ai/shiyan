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
export type Summary = {
  overview: string;
  highlights: (SummaryItem & { title: string })[];
  positions: SummaryItem[];
  questions: SummaryItem[];
  suggestions: SummaryItem[];
  uncertainty: string;
};
export type Report = {
  id: string; topicId: string; kind: "topic" | "week"; weekStart: string | null;
  summary: Summary; sourceIds: string[]; model: string; createdAt: string;
};
export type TopicDetail = { topic: Topic; conversations: Conversation[]; reports: Report[] };
