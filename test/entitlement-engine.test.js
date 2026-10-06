import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEntitlement } from "../src/entitlement-engine.js";

const policy = {
  id: "demo-benefit",
  version: "2026-10-01",
  requirements: [
    { id: "age", fact: "age", operator: "gte", expected: 18, proofRequired: true },
    { id: "resident", fact: "resident", operator: "equals", expected: true, proofRequired: true },
  ],
};

const evidence = [
  { id: "e-age", fact: "age", value: 29, verificationClass: "authoritative", observedAt: "2026-10-05T20:00:00Z" },
  { id: "e-res", fact: "resident", value: true, verificationClass: "authoritative", observedAt: "2026-10-05T20:00:00Z" },
];

test("returns ELIGIBLE when all requirements and proofs match", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-1", facts: { age: 29, resident: true } },
    evidence,
    observedAt: "2026-10-05T20:01:00Z",
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
  });
  assert.equal(out.state, "NEEDS_EVIDENCE");
  assert.equal(out.missingEvidence[0].fact, "resident");
});

test("returns CONFLICT when authoritative evidence disagrees", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-3", facts: { age: 29, resident: true } },
    evidence: [...evidence, { ...evidence[1], id: "e-res-2", value: false }],
  });
  assert.equal(out.state, "CONFLICT");
});

test("returns INELIGIBLE when a proven requirement fails", () => {
  const out = evaluateEntitlement({
    policy,
    caseRecord: { id: "case-4", facts: { age: 17, resident: true } },
    evidence: [{ ...evidence[0], value: 17 }, evidence[1]],
  });
  assert.equal(out.state, "INELIGIBLE");
});
