import { NextRequest, NextResponse } from "next/server";
import { generateFishAudioSpeech, isVercelGatewayConfigured } from "@/server/ai/vercel-gateway";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { text, model } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ status: "error", message: "text is required" }, { status: 400 });
    }

    if (!isVercelGatewayConfigured()) {
      return NextResponse.json(
        { status: "unavailable", message: "Vercel AI Gateway key not configured" },
        { status: 503 }
      );
    }

    const audioBuffer = await generateFishAudioSpeech(text, {
      model: model || "fish-audio/s2.1-pro",
    });

    if (!audioBuffer) {
      return NextResponse.json(
        {
          status: "verification_required",
          message: "Vercel AI Gateway requires a verified card on file to stream fish-audio speech models.",
        },
        { status: 402 }
      );
    }

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error?.message }, { status: 500 });
  }
}
