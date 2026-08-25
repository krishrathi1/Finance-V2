import { NextRequest, NextResponse } from "next/server";
import { copilotReply, CopilotMessage } from "@/server/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history: CopilotMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: unknown) => {
            const msg = m as { role?: string; content?: string };
            return msg && typeof msg.content === "string" && (msg.role === "user" || msg.role === "assistant");
          })
          .slice(-10)
      : [];
    const contextSymbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : null;

    if (history.length === 0) {
      return NextResponse.json({ success: false, error: "history is required" }, { status: 400 });
    }

    const { answer, source } = await copilotReply(history, contextSymbol);
    return NextResponse.json({ success: true, data: { answer, source } });
  } catch (err) {
    console.error("[api/ai/copilot]", err);
    return NextResponse.json({ success: false, error: "Copilot failed" }, { status: 500 });
  }
}
