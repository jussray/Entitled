import { createHash } from "node:crypto";

export const DETERMINATION_STATES = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_EVIDENCE: "NEEDS_EVIDENCE",
  CONFLICT: "CONFLICT",
  UNKNOWN: "UNKNOWN",
});

const DAY_MS = 24 * 60 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

function parseTime(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a valid date-time`);
  return parsed;
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
    .sort((a, b) => {
      const aTime = parseTime(a.asOf ?? a.observedAt, `Evidence ${a.id ?? fact} timestamp`) ?? -Infinity;
      const bTime = parseTime(b.asOf ?? b.observedAt, `Evidence ${b.id ?? fact} timestamp`) ?? -Infinity;
      return bTime - aTime;
    });
}

function policyGate(policy, observedAt) {
  const observed = parseTime(observedAt, "observedAt");
  const status = required(policy?.status, "policy.status");
  const effectiveFrom = parseTime(policy?.effectiveFrom, "policy.effectiveFrom");
  const effectiveTo = parseTime(policy?.effectiveTo, "policy.effectiveTo");

  if (status !== "ACTIVE") {
    return { ok:false, status, effectiveFrom, effectiveTo, reason:`Policy status is ${status}, not ACTIVE.` };
  }
  if (effectiveFrom !== null && observed < effectiveFrom) {
    return { ok:false, status, effectiveFrom, effectiveTo, reason:"Policy is not effective yet." };
  }
  if (effectiveTo !== null && observed > effectiveTo) {
    return { ok:false, status, effectiveFrom, effectiveTo, reason:"Policy is no longer effective." };
  }
  return { ok:true, status, effectiveFrom, effectiveTo };
}

function usableWitnesses(witnesses, requirement, observedAt) {
  const observed = parseTime(observedAt, "observedAt");
  const maxAgeDays = requirement?.maxEvidenceAgeDays;
  const maxAgeMs = Number.isFinite(Number(maxAgeDays)) && Number(maxAgeDays) >= 0
    ? Number(maxAgeDays) * DAY_MS
    : null;

  const usable = [];
  const rejected = [];

  for (const witness of witnesses) {
    const witnessTime = parseTime(
      witness.asOf ?? witness.observedAt,
      `Evidence ${witness.id ?? requirement.fact} timestamp`
    );
    if (witnessTime === null) {
      rejected.push({ id:witness.id, reason:"missing_timestamp" });
      continue;
    }
    if (witnessTime > observed) {
      rejected.push({ id:witness.id, reason:"future_timestamp" });
      continue;
    }
    if (maxAgeMs !== null && observed - witnessTime > maxAgeMs) {
      rejected.push({ id:witness.id, reason:"stale" });
      continue;
    }
    usable.push(witness);
  }
  return { usable, rejected };
}

export function evaluateEntitlement({ policy, caseRecord, evidence = [], observedAt = new Date().toISOString() }) {
  const policyId = required(policy?.id, "policy.id");
  const policyVersion = required(policy?.version, "policy.version");
  const caseId = required(caseRecord?.id, "caseRecord.id");
  const requirements = Array.isArray(policy?.requirements) ? policy.requirements : [];
  const facts = caseRecord?.facts ?? {};
  const gate = policyGate(policy, observedAt);

  if (!gate.ok) {
    return finalize({
      state: DETERMINATION_STATES.UNKNOWN,
      reason: gate.reason,
      policyId,
      policyVersion,
      policyStatus: gate.status,
      policyEffectiveFrom: policy.effectiveFrom ?? null,
      policyEffectiveTo: policy.effectiveTo ?? null,
      caseId,
      observedAt,
      checks: [],
      missingEvidence: [],
      conflicts: [],
      nextActions: ["Load an ACTIVE policy version that is effective for the determination time."],
    });
  }

  if (requirements.length === 0) {
    return finalize({
      state: DETERMINATION_STATES.UNKNOWN,
      reason: "The ruleset has no requirements to evaluate.",
      policyId,
      policyVersion,
      policyStatus: gate.status,
      policyEffectiveFrom: policy.effectiveFrom ?? null,
      policyEffectiveTo: policy.effectiveTo ?? null,
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
    const authoritative = authoritativeEvidenceFor(evidence, fact);
    const { usable: witnesses, rejected } = usableWitnesses(authoritative, requirement, observedAt);
    const distinctWitnessValues = [...new Set(witnesses.map((item) => JSON.stringify(item.value)))];

    if (actual === undefined || actual === null || actual === "") {
      missingEvidence.push({ requirementId, fact, reason: "Case fact is missing." });
      checks.push({ requirementId, fact, status: "MISSING", actual: null });
      continue;
    }

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

    if (proofRequired && witnesses.length === 0) {
      const rejectedReasons = [...new Set(rejected.map((item) => item.reason))];
      missingEvidence.push({
        requirementId,
        fact,
        reason: authoritative.length === 0
          ? "Authoritative evidence is required."
          : `No current usable authoritative evidence remains: ${rejectedReasons.join(", ")}.`,
      });
      checks.push({
        requirementId,
        fact,
        status: authoritative.length === 0 ? "UNPROVEN" : "STALE_OR_INVALID",
        actual,
        rejectedWitnessIds: rejected.map((item) => item.id).filter(Boolean),
      });
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
    reason = "Conflicting case facts or current authoritative evidence prevent a reliable determination.";
    nextActions = ["Resolve the listed evidence conflicts before relying on the determination."];
  } else if (missingEvidence.length > 0) {
    state = DETERMINATION_STATES.NEEDS_EVIDENCE;
    reason = "One or more required facts or current proofs are missing.";
    nextActions = missingEvidence.map((item) => `Obtain current evidence for ${item.fact}.`);
  } else if (hasFailure) {
    state = DETERMINATION_STATES.INELIGIBLE;
    reason = "At least one loaded requirement is not satisfied by the current case evidence.";
    nextActions = ["Review the failed requirements and confirm the applicable ruleset and evidence are current."];
  } else {
    state = DETERMINATION_STATES.ELIGIBLE;
    reason = "All loaded requirements are satisfied by current case facts and required evidence.";
    nextActions = ["Present the evidence-bound determination for the appropriate human or official review step."];
  }

  return finalize({
    state,
    reason,
    policyId,
    policyVersion,
    policyStatus: gate.status,
    policyEffectiveFrom: policy.effectiveFrom ?? null,
    policyEffectiveTo: policy.effectiveTo ?? null,
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
    policyStatus: payload.policyStatus,
    policyEffectiveFrom: payload.policyEffectiveFrom,
    policyEffectiveTo: payload.policyEffectiveTo,
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
