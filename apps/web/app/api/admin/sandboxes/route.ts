import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session/get-server-session";
import { isUserAdmin } from "@/lib/db/users";
import { listAllBoxdMachines, deleteAllBoxdMachines } from "@entry-agents/sandbox";

async function isAuthorized(req: Request): Promise<boolean> {
  const suppliedSecret = req.headers.get("x-audit-secret");
  const expectedSecret = process.env.AUDIT_ROUTE_SECRET;
  const expectedSecretLive = process.env.AUDIT_ROUTE_SECRET_LIVE;

  if (
    suppliedSecret &&
    ((expectedSecret && suppliedSecret === expectedSecret) ||
      (expectedSecretLive && suppliedSecret === expectedSecretLive))
  ) {
    return true;
  }

  const session = await getServerSession();
  if (session?.user?.id) {
    const isAdmin = await isUserAdmin(session.user.id).catch(() => false);
    if (isAdmin) {
      return true;
    }
  }

  return false;
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const machines = await listAllBoxdMachines();
    return NextResponse.json({
      success: true,
      count: machines.length,
      limit: 50,
      machines,
    });
  } catch (error) {
    console.error("[admin/sandboxes] Failed to list machines:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list sandboxes" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await deleteAllBoxdMachines();
    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} Boxd machines. Remaining: ${result.remainingCount}.`,
      ...result,
    });
  } catch (error) {
    console.error("[admin/sandboxes] Failed to purge machines:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to purge sandboxes" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  return POST(req);
}
