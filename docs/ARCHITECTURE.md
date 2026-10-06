# Entitled Architecture

## Mission

Entitled determines what a person appears eligible or entitled to **under an explicitly loaded ruleset and the evidence available for their case**.

It is a rules-and-evidence decision-support product, not a clone or presentation layer of Living Truth.

## Core objects

- **RuleSet** — source, version, effective period, jurisdiction/scope, requirements.
- **Requirement** — fact, comparison operator, expected value, proof requirement.
- **Case** — subject and normalized facts.
- **Evidence** — source-backed proof tied to a fact with provenance and freshness.
- **RequirementCheck** — satisfied, not satisfied, missing, unproven, or conflicting.
- **Determination** — ELIGIBLE, INELIGIBLE, NEEDS_EVIDENCE, CONFLICT, or UNKNOWN.
- **DeterminationReceipt** — bounded fingerprint of policy + case + evidence result.
- **NextAction** — evidence collection, conflict resolution, review, application, appeal, or other workflow step configured by the product.

## Authority boundary

Entitled can explain and organize an evidence-bound determination. A receipt is not itself an official agency, court, employer, insurer, contract administrator, or other authoritative decision. It cannot self-grant benefits, rights, money, access, approval, or legal status.

## Relationship to Living Truth

Living Truth can be used as an evidence/provenance source, but the products remain separate:

- Living Truth: **What is true and how do we know?**
- Entitled: **Given these rules and this evidence, what is the case outcome and what is still needed?**

No product inherits action authority from the other.
