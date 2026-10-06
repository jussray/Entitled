import test from "node:test";
import assert from "node:assert/strict";
import { determinationToBase44, evaluateBase44Case } from "../src/base44-adapter.js";

const policyRow = {
  id: "p1",
  version: "2026-10-01",
  status: "ACTIVE",
  effective_from: "2026-10-01T00:00:00Z",
  effective_to: "2026-12-31T23:59:59Z",
};
const requirementRows = [
  { id: "r1", policy_id: "p1", fact: "age", operator: "gte", expected_json: "18", proof_required: true, max_age_days: 30 },
  { id: "r2", policy_id: "p1", fact: "resident", operator: "equals", expected_json: "true", proof_required: true, max_age_days: 30 },
];
const caseRow = { id: "c1", owner_id: "user-123", facts_json: JSON.stringify({ age: 29, resident: true }) };
const evidenceRows = [
  { id: "e1", case_id: "c1", fact: "age", value_json: "29", verification_class: "authoritative", observed_at: "2026-10-05T20:00:00Z" },
  { id: "e2", case_id: "c1", fact: "resident", value_json: "true", verification_class: "authoritative", observed_at: "2026-10-05T20:00:00Z" },
];

test("adapts Base44 rows into an eligible determination", () => {
  const out = evaluateBase44Case({
    policyRow,
    requirementRows,
    caseRow,
    evidenceRows,
    observedAt: "2026-10-05T20:01:00Z",
  });
  assert.equal(out.state, "ELIGIBLE");
  const persisted = determinationToBase44(out);
  assert.equal(persisted.determination.owner_id, "user-123");
  assert.equal(persisted.receipt.owner_id, "user-123");
  assert.equal(persisted.determination.authorizing, false);
  assert.equal(persisted.receipt.official_decision, false);
  assert.equal(persisted.receipt.legal_conclusion, false);
});

test("Base44 inactive policy cannot evaluate as eligible", () => {
  const out = evaluateBase44Case({
    policyRow: { ...policyRow, status: "DRAFT" },
    requirementRows,
    caseRow,
    evidenceRows,
    observedAt: "2026-10-05T20:01:00Z",
  });
  assert.equal(out.state, "UNKNOWN");
});

test("fails loudly on malformed Base44 JSON instead of inventing a value", () => {
  assert.throws(
    () => evaluateBase44Case({
      policyRow,
      requirementRows,
      caseRow: { id: "c1", facts_json: "{broken" },
      evidenceRows,
      observedAt: "2026-10-05T20:01:00Z",
    }),
    /valid JSON/
  );
});
