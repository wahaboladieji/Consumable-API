import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const startTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  return NextResponse.json(
    {
      status: "ok",
      uptimeSeconds,
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
