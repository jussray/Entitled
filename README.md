# Entitled

Entitled answers a different question from Living Truth:

> **Given an applicable ruleset and the evidence in this case, what does the person appear eligible or entitled to, what requirements are satisfied, what is missing or conflicting, and what should happen next?**

Entitled is the repurposed product formerly prototyped in Base44 as `Living Truth (Copy)`. It is **not** a public clone of Living Truth.

## Core loop

```text
CASE + RULESET + EVIDENCE
        |
        v
REQUIREMENT CHECKS
        |
        v
ELIGIBLE / INELIGIBLE / NEEDS_EVIDENCE / CONFLICT / UNKNOWN
        |
        v
DETERMINATION RECEIPT + NEXT ACTIONS
```

Determinations are bounded to the loaded rules and evidence. They do not themselves create legal rights, authorize provider actions, or replace an official decision-maker.

## Base44 binding

Canonical Base44 app id: `6a94a9bdf1ac72972e1d1470`.

## Run

```bash
npm test
```

No third-party runtime dependencies are required.
