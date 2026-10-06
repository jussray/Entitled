import test from "node:test";
import assert from "node:assert/strict";
import contract from "../base44/schema-contract.json" with { type: "json" };

test("Entitled exposes only policy metadata publicly", () => {
  assert.deepEqual([...contract.publicRead].sort(), ["Policy", "Requirement"]);
  for (const entity of ["CaseRecord","CaseEvidence","Determination","DeterminationReceipt"]) {
    assert.ok(contract.adminOnlyRead.includes(entity));
    assert.ok(!contract.publicRead.includes(entity));
  }
});

test("former Living Truth entities stay deprecated and private", () => {
  assert.ok(contract.deprecatedAdminOnly.includes("Claim"));
  assert.ok(contract.deprecatedAdminOnly.includes("Evidence"));
  assert.ok(contract.deprecatedAdminOnly.includes("ReconciliationReceipt"));
});
