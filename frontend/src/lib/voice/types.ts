export type VoiceState =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "processing"
  | "thinking"
  | "speaking"
  | "error";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  timestamp?: number;
}

export interface ScreenMetric {
  label: string;
  value: string;
  category?: string;
}

export interface ScreenMemoryChunk {
  id: string;
  type: "structured_fact" | "table_row" | "section_text" | "navigation";
  title: string;
  content: string;
  keywords: string[];
  metadata: {
    route: string;
    source: string;
    timestamp: number;
    symbol?: string;
    section?: string;
  };
}

export interface ScreenStockFacts {
  symbol: string;
  companyName?: string;
  price?: string;
  changePercent?: string;
  pe?: string;
  marketCap?: string;
  smartScore?: string;
  sector?: string;
}

export interface ScreenSnapshot {
  sessionId: string;
  route: string;
  pageTitle: string;
  timestamp: number;
  stock?: ScreenStockFacts;
  metrics: ScreenMetric[];
  chunks: ScreenMemoryChunk[];
}

export interface VoiceTalkRequest {
  sessionId: string;
  message?: string;
  audioData?: string;
  mimeType?: string;
  history?: ChatTurn[];
  screenSnapshot?: ScreenSnapshot;
}

export interface VoiceTalkResponse {
  success: boolean;
  sessionId: string;
  userQuery: string;
  textReply: string;
  provider: "elevenlabs" | "fallback";
  audioBase64: string | null;
  audioMimeType: string;
  retrievedChunksCount?: number;
  error?: string;
}
