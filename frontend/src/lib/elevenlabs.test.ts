import { beforeEach, describe, expect, it, vi } from "vitest";

const convertMock = vi.fn();

vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: vi.fn(function thisElevenLabsClientMock() {
    return {
      textToSpeech: {
        convert: convertMock,
      },
    };
  }),
}));

describe("synthesizeSpeech", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.ELEVENLABS_API_KEY;
  });

  it("throws a clear error when ELEVENLABS_API_KEY is missing", async () => {
    const { synthesizeSpeech } = await import("@/lib/elevenlabs");

    await expect(synthesizeSpeech("hello")).rejects.toThrow("Missing ELEVENLABS_API_KEY");
    const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
    expect(ElevenLabsClient).not.toHaveBeenCalled();
  });

  it("initializes client lazily and synthesizes audio when key is present", async () => {
    process.env.ELEVENLABS_API_KEY = "test-api-key";
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: Buffer.from("abc") })
      .mockResolvedValueOnce({ done: true, value: undefined });
    convertMock.mockResolvedValue({
      getReader: () => ({ read }),
    });

    const { synthesizeSpeech } = await import("@/lib/elevenlabs");
    const result = await synthesizeSpeech("hello");

    const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
    expect(ElevenLabsClient).toHaveBeenCalledWith({ apiKey: "test-api-key" });
    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      audioBase64: Buffer.from("abc").toString("base64"),
      mimeType: "audio/mpeg",
    });
  });
});
