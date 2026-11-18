import { getPlanDefinition, type PlanId } from "./plans";

export interface ExternalIntegrationAccessResult {
  allowed: boolean;
  planId: PlanId;
  code?: "PLAN_UPGRADE_REQUIRED";
  reason?: string;
}

/**
 * Pure policy: Free-tier users cannot connect external Composio toolkits or
 * custom MCP servers (which consume Composio session quotas, stdio sandbox
 * processes, and tool-loop tokens). Admins and all paid plans (Plus, Entry,
 * Pro, Max) have full access.
 */
export function evaluateExternalIntegrationAccess(input: {
  plan: string | null | undefined;
  isAdmin?: boolean;
}): ExternalIntegrationAccessResult {
  const planDef = getPlanDefinition(input.plan);

  if (input.isAdmin) {
    return {
      allowed: true,
      planId: planDef.id,
    };
  }

  if (planDef.id === "free") {
    return {
      allowed: false,
      planId: planDef.id,
      code: "PLAN_UPGRADE_REQUIRED",
      reason:
        "External integrations (Composio and custom MCP servers) require a paid plan. Upgrade to Plus or higher to connect apps.",
    };
  }

  return {
    allowed: true,
    planId: planDef.id,
  };
}
