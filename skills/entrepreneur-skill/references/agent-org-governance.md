# agent-org-governance

## Use when

- Building or scaling a multi-agent operating model.
- Defining authority boundaries between agents and humans.

## Inputs

- Business objective and service scope
- Candidate agent roles
- Risk profile and compliance constraints
- Escalation and approval requirements

## Steps

1. Define agent role map (strategy, PMF, growth, ops, finance, compliance).
2. Assign permissions per role (read/write/execute/publish).
3. Define approval gates for irreversible or high-risk actions.
4. Define conflict resolution protocol for agent disagreement.
5. Instrument audit trail for key decisions and external actions.

## Governance contract

```md
Role:
Allowed actions:
Restricted actions:
Requires human approval for:
Escalation owner:
Audit fields:
```

## Acceptance criteria

- Every role has explicit allowed and restricted actions.
- Human approval gates are defined for irreversible actions.
- Conflict resolution owner is identified.
- Audit fields are sufficient for post-mortem accountability.

