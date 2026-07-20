// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The Express-facing layer, same 3-step shape as every other controller in
// this project: validate, call the service, respond.
// ============================================================================

import type { Request, Response } from "express";
import { createRiskSchema, updateRiskSchema } from "@opssphere/validation";
import type { ApiSuccessResponse, RiskSummary } from "@opssphere/shared-types";
import * as riskService from "./risk.service.js";
import { ApiError } from "../../middleware/errorHandler.js";

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  return Object.entries(error.flatten().fieldErrors).map(([field, messages]) => ({
    field,
    message: messages?.[0] ?? "Invalid value",
  }));
}

// GET /api/v1/organizations/:organizationId/projects/:projectId/risks
export async function listRisksHandler(req: Request, res: Response) {
  const risks = await riskService.listRisks(req.organizationId ?? "", String(req.params.projectId ?? ""));
  const body: ApiSuccessResponse<{ risks: RiskSummary[] }> = { success: true, data: { risks } };
  res.status(200).json(body);
}

// POST /api/v1/organizations/:organizationId/projects/:projectId/risks
export async function createRiskHandler(req: Request, res: Response) {
  const parsed = createRiskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const risk = await riskService.createRisk(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    req.userId ?? "",
    parsed.data
  );

  const body: ApiSuccessResponse<{ risk: RiskSummary }> = {
    success: true,
    message: "Risk added to the register.",
    data: { risk },
  };
  res.status(201).json(body);
}

// PATCH /api/v1/organizations/:organizationId/projects/:projectId/risks/:riskId
export async function updateRiskHandler(req: Request, res: Response) {
  const parsed = updateRiskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Validation failed", fieldErrorsFrom(parsed.error));
  }

  const risk = await riskService.updateRisk(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.riskId ?? ""),
    parsed.data
  );

  const body: ApiSuccessResponse<{ risk: RiskSummary }> = {
    success: true,
    message: "Risk updated.",
    data: { risk },
  };
  res.status(200).json(body);
}

// DELETE /api/v1/organizations/:organizationId/projects/:projectId/risks/:riskId
export async function deleteRiskHandler(req: Request, res: Response) {
  await riskService.deleteRisk(
    req.organizationId ?? "",
    String(req.params.projectId ?? ""),
    String(req.params.riskId ?? "")
  );
  const body: ApiSuccessResponse<null> = { success: true, message: "Risk removed.", data: null };
  res.status(200).json(body);
}
