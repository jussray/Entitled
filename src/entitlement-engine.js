import { createHash } from "node:crypto";

export const DETERMINATION_STATES = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_EVIDENCE: "NEEDS_EVIDENCE",
  CONFLICT: "CONFLICT",
  UNKNOWN: "UNKNOWN",
});

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function compare(actual, operator, expected) {
  switch (operator) {
    case "equals": return Object.is(actual, expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "in": return Array.isArray(expected) && expected.includes(actual);
    case "present": return actual !== undefined && actual !== null && actual !== "";
    default: throw new TypeError(`Unsupported operator: ${operator}`);
  }
}

function authoritativeEvidenceFor(evidence, fact) {
  return (evidence ?? [])
    .filter((item) => item?.fact === fact && item?.verificationClass === "authoritative")
    .sort((a, b) => Date.parse(b.asOf ?? b.observedAt ?? 0) - Date.parse(a.asOf ?? a.observedAt ?? 0));
}

export function evaluateEntitlement({ policy, caseRecord, evidence = [], observedAt = new Date().toISOString() }) {
  const policyId = required(policy?.id, "policy.id");
  const policyVersion = required(policy?.version, "policy.version");
  const caseId = required(caseRecord?.id, "caseRecord.id");
  const requirements = Array.isArray(policy?.requirements) ? policy.requirements : [];
  const facts = caseRecord?.facts ?? {};

  if (requirements.length === 0) {
    return finalize({
      state: DETERMINATION_STATES.UNKNOWN,
      reason: "The ruleset has no requirements to evaluate.",
      policyId,
      policyVersion,
      caseId,
      observedAt,
      checks: [],
      missingEvidence: [],
      conflicts: [],
      nextActions: ["Load an applicable ruleset with explicit requirements."],
    });
  }

  const checks = [];
  const missingEvidence = [];
  const conflicts = [];
  let hasFailure = false;

  for (const requirement of requirements) {
    const requirementId = required(requirement?.id, "requirement.id");
    const fact = required(requirement?.fact, "requirement.fact");
    const proofRequired = requirement.proofRequired !== false;
    const actual = facts[fact];
    const witnesses = authoritativeEvidenceFor(evidence, fact);
    const distinctWitnessValues = [...new Set(witnesses.map((item) => JSON.stringify(item.value)))];

    if (distinctWitnessValues.length > 1) {
      conflicts.push({
        requirementId,
        fact,
        witnessIds: witnesses.map((item) => item.id).filter(Boolean),
        values: witnesses.map((item) => item.value),
      });
      checks.push({ requirementId, fact, status: "CONFLICT", actual });
      continue;
    }

    if (actual === undefined || actual === null || actual === "") {
      missingEvidence.push({ requirementId, fact, reason: "Case fact is missing." });
      checks.push({ requirementId, fact, status: "MISSING", actual: null });
      continue;
    }

    if (proofRequired && witnesses.length === 0) {
      missingEvidence.push({ requirementId, fact, reason: "Authoritative evidence is required." });
      checks.push({ requirementId, fact, status: "UNPROVEN", actual });
      continue;
    }

    if (witnesses.length > 0 && !Object.is(witnesses[0].value, actual)) {
      conflicts.push({
        requirementId,
        fact,
        caseValue: actual,
        evidenceValue: witnesses[0].value,
        witnessIds: witnesses.map((item) => item.id).filter(Boolean),
      });
      checks.push({ requirementId, fact, status: "CONFLICT", actual });
      continue;
    }

    const passed = compare(actual, requirement.operator ?? "equals", requirement.expected);
    if (!passed) hasFailure = true;
    checks.push({
      requirementId,
      fact,
      status: passed ? "SATISFIED" : "NOT_SATISFIED",
      actual,
      expected: requirement.expected,
      operator: requirement.operator ?? "equals",
      witnessIds: witnesses.map((item) => item.id).filter(Boolean),
    });
  }

  let state;
  let reason;
  let nextActions = [];

  if (conflicts.length > 0) {
    state = DETERMINATION_STATES.CONFLICT;
    reason = "Conflicting case facts or authoritative evidence prevent a reliable determination.";
    nextActions = ["Resolve the listed evidence conflicts before relying on the determination."];
  } else if (missingEvidence.length > 0) {
    state = DETERMINATION_STATES.NEEDS_EVIDENCE;
    reason = "One or more required facts or proofs are missing.";
    nextActions = missingEvidence.map((item) => `Obtain evidence for ${item.fact}.`);
  } else if (hasFailure) {
    state = DETERMINATION_STATES.INELIGIBLE;
    reason = "At least one loaded requirement is not satisfied by the current case evidence.";
    nextActions = ["Review the failed requirements and confirm the applicable ruleset and evidence are current."];
  } else {
    state = DETERMINATION_STATES.ELIGIBLE;
    reason = "All loaded requirements are satisfied by the current case facts and required evidence.";
    nextActions = ["Present the evidence-bound determination for the appropriate human or official review step."];
  }

  return finalize({
    state,
    reason,
    policyId,
    policyVersion,
    caseId,
    observedAt,
    checks,
    missingEvidence,
    conflicts,
    nextActions,
  });
}

function finalize(payload) {
  const fingerprint = hash({
    policyId: payload.policyId,
    policyVersion: payload.policyVersion,
    caseId: payload.caseId,
    state: payload.state,
    checks: payload.checks,
    missingEvidence: payload.missingEvidence,
    conflicts: payload.conflicts,
    observedAt: payload.observedAt,
  });

  return {
    ...payload,
    receipt: {
      id: `ENT-${fingerprint.slice(0, 16)}`,
      fingerprint,
      policyId: payload.policyId,
      policyVersion: payload.policyVersion,
      caseId: payload.caseId,
      determination: payload.state,
      observedAt: payload.observedAt,
      authorizing: false,
      officialDecision: false,
      legalConclusion: false,
    },
  };
}
