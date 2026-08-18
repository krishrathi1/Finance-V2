import { NextResponse } from "next/server";
import { getInstitutionalFlowsData } from "@/server/domain/institutional-flows";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = getInstitutionalFlowsData();
    return NextResponse.json({
      status: "success",
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error?.message || "Failed to retrieve institutional flows" },
      { status: 500 }
    );
  }
}
