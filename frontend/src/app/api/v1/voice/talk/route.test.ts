import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const { transcribeWithGroq } = vi.hoisted(() => ({ transcribeWithGroq: vi.fn() }));

vi.mock("@/server/ai/groq-whisper", () => ({ transcribeWithGroq }));

// Mock ElevenLabs synthesis
vi.mock("@/lib/elevenlabs", () => ({
  synthesizeSpeech: vi.fn().mockResolvedValue({
    audioBase64: "dGVzdC1hdWRpby1ieXRlcw==",
    mimeType: "audio/mpeg",
  }),
}));

describe("POST /api/v1/voice/talk", () => {
  const originalFetch = global.fetch;
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "mock-gemini-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalEnvKey;
  });

  it("rejects requests missing sessionId with 400", async () => {
    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({ message: "What is this stock?" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("sessionId is required");
  });

  it("rejects requests missing both message and audioData with 400", async () => {
    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({ sessionId: "sess-123" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Either message text or audioData payload is required");
  });

  it("processes a grounded user question and returns contextual speech response", async () => {
    // Mock Gemini returning valid financial explanation
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "TCS ka current price ₹3,920 hai aur P/E ratio 28.4 chal raha hai jo fair valuation par hai.",
                },
              ],
            },
          },
        ],
      }),
    });

    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess-test-456",
        message: "What is the CMP and PE of this stock?",
        screenSnapshot: {
          sessionId: "sess-test-456",
          route: "/stocks/TCS",
          pageTitle: "TCS Analysis",
          stock: {
            symbol: "TCS",
            price: "3920.00",
            pe: "28.4",
          },
          metrics: [],
          chunks: [],
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe("sess-test-456");
    expect(data.userQuery).toBe("What is the CMP and PE of this stock?");
    expect(data.textReply).toContain("TCS");
    expect(data.audioBase64).toBe("dGVzdC1hdWRpby1ieXRlcw==");
  });

  it("uses Groq Whisper audio transcription instead of a partial browser transcript", async () => {
    transcribeWithGroq.mockResolvedValueOnce("What is the price of Reliance?");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Reliance is shown at 2,500 rupees." }] } }] }),
    });

    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess-groq-123",
        message: "What is the price of",
        audioData: "dGVzdC1hdWRpby1ieXRlcw==",
        mimeType: "audio/webm;codecs=opus",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(transcribeWithGroq).toHaveBeenCalledWith("dGVzdC1hdWRpby1ieXRlcw==", "audio/webm;codecs=opus");
    expect(data.userQuery).toBe("What is the price of Reliance?");
  });

  it("falls back to browser transcript if Groq transcription fails", async () => {
    transcribeWithGroq.mockRejectedValueOnce(new Error("Groq unavailable"));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Fallback response." }] } }] }),
    });

    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess-groq-fallback-123",
        message: "Browser transcript fallback",
        audioData: "dGVzdC1hdWRpby1ieXRlcw==",
        mimeType: "audio/webm",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.userQuery).toBe("Browser transcript fallback");
  });

  it("returns 502 error when Gemini model fails instead of substituting a fake greeting", async () => {
    // Mock Gemini returning failure
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });

    const req = new NextRequest("http://localhost/api/v1/voice/talk", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "sess-fail-789",
        message: "Can you analyze this stock?",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("AI model could not formulate a response");
    // Verify it did NOT return the hardcoded greeting
    expect(data.textReply).toBeUndefined();
  });
});
