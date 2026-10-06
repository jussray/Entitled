import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEntitlement } from "../src/entitlement-engine.js";

const observedAt = "2026-10-05T20:01:00Z";
const policy = {
  id: "demo-benefit",
  version: "2026-10-01",
  status: "ACTIVE",
  effectiveFrom: "2026-10-01T00:00:00Z",
  effectiveTo: "2026-12-31T23:59:59Z",
  requirements: [
    { id: "age", fact: "age", operator: "gte", expected: 18, proofRequired: true, maxEvidenceAgeDays: 30 },
    { id: "resident", fact: "resident", operator: "equals", expected: true, proofRequired: true, maxEvidenceAgeDays: 30 },
  ],
};

const evidence = [
  { id: "e-age", fact: "age", value: 29, verificationClass: "authoritative", observedAt: "2026-10-05T20:00:00Z" },
  { id: "e-res", fact: "resident", value: true, verificationClass: "authoritative", observedAt: "2026-10-05T20:00:00Z" },
];

test("returns ELIGIBLE when active policy requirements and fresh proofs match", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-1", facts: { age: 29, resident: true } },
    evidence,
    observedAt,
  });
  assert.equal(out.state, "ELIGIBLE");
  assert.equal(out.receipt.authorizing, false);
  assert.equal(out.receipt.officialDecision, false);
});

test("returns NEEDS_EVIDENCE when proof is missing", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-2", facts: { age: 29, resident: true } },
    evidence: [evidence[0]],
    observedAt,
  });
  assert.equal(out.state, "NEEDS_EVIDENCE");
  assert.equal(out.missingEvidence[0].fact, "resident");
});

test("returns CONFLICT when current authoritative evidence disagrees", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-3", facts: { age: 29, resident: true } },
    evidence: [...evidence, { ...evidence[1], id: "e-res-2", value: false }],
    observedAt,
  });
  assert.equal(out.state, "CONFLICT");
});

test("returns INELIGIBLE when a proven requirement fails", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-4", facts: { age: 17, resident: true } },
    evidence: [{ ...evidence[0], value: 17 }, evidence[1]],
    observedAt,
  });
  assert.equal(out.state, "INELIGIBLE");
});

test("refuses inactive policy versions", () => {
  const out = evaluateEntitlement({
    policy: { ...policy, status: "SUPERSEDED" },
    caseRecord: { id: "case-5", facts: { age: 29, resident: true } },
    evidence,
    observedAt,
  });
  assert.equal(out.state, "UNKNOWN");
  assert.match(out.reason, /SUPERSEDED/);
});

test("refuses policies outside their effective window", () => {
  const out = evaluateEntitlement({
    policy: { ...policy, effectiveTo: "2026-09-30T23:59:59Z" },
    caseRecord: { id: "case-6", facts: { age: 29, resident: true } },
    evidence,
    observedAt,
  });
  assert.equal(out.state, "UNKNOWN");
  assert.match(out.reason, /no longer effective/);
});

test("stale authoritative evidence cannot keep a case eligible", () => {
  const stale = evidence.map((item) => ({ ...item, observedAt: "2026-08-01T00:00:00Z" }));
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-7", facts: { age: 29, resident: true } },
    evidence: stale,
    observedAt,
  });
  assert.equal(out.state, "NEEDS_EVIDENCE");
  assert.ok(out.missingEvidence.every((item) => item.reason.includes("stale")));
});

test("future-dated evidence is not accepted as current proof", () => {
  const future = evidence.map((item) => ({ ...item, observedAt: "2026-10-07T00:00:00Z" }));
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-8", facts: { age: 29, resident: true } },
    evidence: future,
    observedAt,
  });
  assert.equal(out.state, "NEEDS_EVIDENCE");
  assert.ok(out.missingEvidence.every((item) => item.reason.includes("future_timestamp")));
});


test("unset evidence age does not collapse to zero-day expiry", () => {
  const policyWithoutAgeLimit = {
    ...policy,
    requirements: policy.requirements.map(({ maxEvidenceAgeDays, ...requirement }) => requirement),
  };
  const olderEvidence = evidence.map((item) => ({ ...item, observedAt: "2026-09-01T00:00:00Z" }));
  const out = evaluateEntitlement({
    policy: policyWithoutAgeLimit,
    caseRecord: { id: "case-9", facts: { age: 29, resident: true } },
    evidence: olderEvidence,
    observedAt,
  });
  assert.equal(out.state, "ELIGIBLE");
});

test("invalid negative evidence age is rejected instead of silently disabling freshness", () => {
  const invalidPolicy = {
    ...policy,
    requirements: [{ ...policy.requirements[0], maxEvidenceAgeDays: -1 }, policy.requirements[1]],
  };
  assert.throws(
    () => evaluateEntitlement({
      policy: invalidPolicy,
      caseRecord: { id: "case-10", facts: { age: 29, resident: true } },
      evidence,
      observedAt,
    }),
    /non-negative number/
  );
});


test("malformed authoritative evidence timestamp is rejected without crashing the case", () => {
  const malformed = evidence.map((item) => ({ ...item, observedAt: "not-a-date" }));
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-11", facts: { age: 29, resident: true } },
    evidence: malformed,
    observedAt,
  });
  assert.equal(out.state, "NEEDS_EVIDENCE");
  assert.ok(out.missingEvidence.every((item) => item.reason.includes("invalid_timestamp")));
});
