import test from "node:test";
import assert from "node:assert/strict";
import contract from "../base44/schema-contract.json" with { type: "json" };

test("Entitled exposes only policy metadata publicly", () => {
  assert.deepEqual([...contract.publicRead].sort(), ["Policy", "Requirement"]);
  assert.equal(contract.ownerField, "owner_id");
  assert.equal(contract.ownerTemplate, "{{user.id}}");
  for (const entity of ["CaseRecord","CaseEvidence","Determination","DeterminationReceipt"]) {
    assert.ok(contract.ownerOrAdminRead.includes(entity));
    assert.ok(!contract.publicRead.includes(entity));
  }
});

test("user-created case rows and admin-created decisions keep separate write authority", () => {
  assert.deepEqual([...contract.userOwnedCreate].sort(), ["CaseEvidence", "CaseRecord"]);
  assert.deepEqual([...contract.adminCreated].sort(), ["Determination", "DeterminationReceipt"]);
});

test("former Living Truth entities stay deprecated and private", () => {
  assert.ok(contract.deprecatedAdminOnly.includes("Claim"));
  assert.ok(contract.deprecatedAdminOnly.includes("Evidence"));
  assert.ok(contract.deprecatedAdminOnly.includes("ReconciliationReceipt"));
});
