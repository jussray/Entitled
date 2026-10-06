import { evaluateEntitlement } from "./entitlement-engine.js";

function parseJson(value, label) {
  if (value === undefined || value === null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    throw new TypeError(`${label} must contain valid JSON`);
  }
}

export function policyFromBase44(policyRow, requirementRows = []) {
  if (!policyRow?.id || !policyRow?.version) throw new TypeError("Base44 policy id and version are required");
  return {
    id: policyRow.id,
    version: policyRow.version,
    status: policyRow.status,
    effectiveFrom: policyRow.effective_from ?? null,
    effectiveTo: policyRow.effective_to ?? null,
    requirements: requirementRows
      .filter((row) => row?.policy_id === policyRow.id)
      .map((row) => ({
        id: row.id ?? row.requirement_key,
        fact: row.fact,
        operator: row.operator ?? "equals",
        expected: parseJson(row.expected_json, `Requirement ${row.id ?? row.requirement_key} expected_json`),
        proofRequired: row.proof_required !== false,
        maxEvidenceAgeDays: row.max_age_days ?? null,
      })),
  };
}

export function caseFromBase44(caseRow) {
  if (!caseRow?.id) throw new TypeError("Base44 case id is required");
  return {
    id: caseRow.id,
    ownerId: caseRow.owner_id ?? null,
    facts: parseJson(caseRow.facts_json, `Case ${caseRow.id} facts_json`) ?? {},
  };
}

export function evidenceFromBase44(rows = [], caseId) {
  return rows
    .filter((row) => row?.case_id === caseId)
    .map((row) => ({
      id: row.id,
      fact: row.fact,
      value: parseJson(row.value_json, `Evidence ${row.id ?? row.fact} value_json`),
      verificationClass: row.verification_class ?? "manual",
      observedAt: row.observed_at,
      asOf: row.as_of,
      reference: row.reference,
      source: row.source,
      kind: row.kind,
    }));
}

export function evaluateBase44Case({ policyRow, requirementRows = [], caseRow, evidenceRows = [], observedAt }) {
  const policy = policyFromBase44(policyRow, requirementRows);
  const caseRecord = caseFromBase44(caseRow);
  const evidence = evidenceFromBase44(evidenceRows, caseRow.id);
  return evaluateEntitlement({ policy, caseRecord, evidence, observedAt });
}

export function determinationToBase44(outcome) {
  return {
    determination: {
      case_id: outcome.caseId,
      owner_id: outcome.caseOwnerId,
      policy_id: outcome.policyId,
      policy_version: outcome.policyVersion,
      state: outcome.state,
      reason: outcome.reason,
      checks_json: JSON.stringify(outcome.checks),
      missing_evidence_json: JSON.stringify(outcome.missingEvidence),
      conflicts_json: JSON.stringify(outcome.conflicts),
      next_actions: outcome.nextActions,
      observed_at: outcome.observedAt,
      official_decision: false,
      authorizing: false,
    },
    receipt: {
      case_id: outcome.caseId,
      owner_id: outcome.caseOwnerId,
      policy_id: outcome.policyId,
      policy_version: outcome.policyVersion,
      determination: outcome.state,
      fingerprint: outcome.receipt.fingerprint,
      observed_at: outcome.observedAt,
      authorizing: false,
      official_decision: false,
      legal_conclusion: false,
    },
  };
}
