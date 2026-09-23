import type { Claim, InsuranceChangeRequest, InsuranceDocument, InsuranceRelationship, Policy } from "./insurance";

export interface InsuranceSourceAdapter {
  findVerifiedRelationship(externalRelationshipId: string): Promise<InsuranceRelationship | null>;
  listPolicies(externalRelationshipId: string): Promise<Policy[]>;
  listDocuments(externalPolicyId: string): Promise<InsuranceDocument[]>;
  createChangeTask(request: InsuranceChangeRequest): Promise<{ externalTaskId: string }>;
  createClaimIntake(claim: Claim): Promise<{ externalClaimId: string }>;
  createSecureDownload(storageKey: string, expiresInSeconds: number): Promise<string>;
}

export const insuranceSourcePolicy = {
  leadingSystems: ["ANVA", "DDI"] as const,
  workflowTargets: ["Klaas Vis AI Workforce", "Microsoft Graph"] as const,
  rule: "Mijn Destination Known bewaart verwijzingen en klantveilige statussen; Klaas Vis blijft de leidende polis- en schadebron.",
};
