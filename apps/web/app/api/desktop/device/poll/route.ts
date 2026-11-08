import { NextResponse } from "next/server";
import { pollAndConsumeDeviceToken } from "@/lib/desktop/device-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceCode = body.device_code;

    if (!deviceCode || typeof deviceCode !== "string") {
      return NextResponse.json(
        { error: "device_code is required" },
        { status: 400 },
      );
    }

    const result = pollAndConsumeDeviceToken(deviceCode);

    if (result.status === "approved") {
      return NextResponse.json({
        status: "approved",
        session_token: result.sessionToken,
        access_token: result.sessionToken,
        user_id: result.userId,
        email: result.email,
        expires_in: result.expiresIn ?? 600,
      });
    }

    if (result.status === "pending") {
      return NextResponse.json({ status: "pending" });
    }

    return NextResponse.json(
      { status: "expired", error: "Device code expired or invalid" },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
