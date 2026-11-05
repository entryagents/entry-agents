import { NextResponse } from "next/server";
import { createDeviceAuthorization } from "@/lib/desktop/device-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin") || req.headers.get("host") || "https://entry-agents.dev";
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;

    const authData = createDeviceAuthorization();

    const verificationUri = `${baseUrl}/desktop/approve`;
    const verificationUriComplete = `${verificationUri}?code=${encodeURIComponent(authData.userCode)}`;

    return NextResponse.json({
      device_code: authData.deviceCode,
      user_code: authData.userCode,
      code: authData.userCode,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: authData.expiresIn,
      interval: authData.interval,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to initiate device authorization" },
      { status: 500 }
    );
  }
}
