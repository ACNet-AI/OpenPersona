# Multi-Persona Bundle Specification

> **Status: Reserved — P11-B**
>
> Multi-persona bundle installation is not yet implemented. This spec defines the
> format for discovery and curation purposes. Bundles can be searched and browsed
> via the OpenPersona directory but cannot be installed via the CLI today.
>
> See ROADMAP.md → P11-B (Team Preset Bundle) for the implementation roadmap.

---

## Overview

A multi-persona bundle (`packType: "multi"`) is a GitHub repository containing a
coordinated group of personas that operate as a unit — for example, a Builder Team
(Product + Implementation + Reviewer) or a Go-to-Market Team (Research + Writing +
Outreach).

The root manifest for a bundle is **`bundle.json`** (not `persona.json`). Each
member persona is a sub-directory with its own complete skill pack.

---

## Root Layout

```
my-team-bundle/
├── bundle.json          ← root manifest (REQUIRED)
├── README.md            ← human-facing overview
├── pm-persona/          ← member persona (complete skill pack)
│   ├── persona.json
│   └── soul/
├── dev-persona/
│   ├── persona.json
│   └── soul/
└── reviewer-persona/
    ├── persona.json
    └── soul/
```

---

## `bundle.json` Schema

```json
{
  "$schema": "openpersona/bundle",
  "packType": "multi",
  "slug": "builder-team",
  "name": "Builder Team",
  "version": "0.1.0",
  "description": "A coordinated team of product, implementation, and review personas for software development.",
  "author": "acnlabs",
  "personas": [
    {
      "slug": "pm-persona",
      "role": "collaborator",
      "dir": "pm-persona",
      "description": "Product lead — requirements, roadmap, and stakeholder communication"
    },
    {
      "slug": "dev-persona",
      "role": "collaborator",
      "dir": "dev-persona",
      "description": "Implementation specialist — architecture, code, and technical decisions"
    },
    {
      "slug": "reviewer-persona",
      "role": "collaborator",
      "dir": "reviewer-persona",
      "description": "Code reviewer — quality gates, security review, and test coverage"
    }
  ],
  "coordination": {
    "handoffProtocol": "pendingCommands",
    "sharedConstraints": ["soul/constitution.md"],
    "escalationPath": "pm-persona"
  },
  "social": {
    "acn": {
      "gateway": "https://acn.openpersona.com"
    }
  }
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `packType` | `"multi"` | Must be `"multi"` — distinguishes bundle from single pack |
| `slug` | string | URL-safe identifier for the bundle (`^[a-z0-9-]+$`) |
| `name` | string | Display name of the bundle |
| `description` | string | Short description of what the bundle does as a unit |
| `personas` | array | At least 2 member persona entries |

### `personas[]` Entry Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | string | ✓ | Slug of the member persona (matches its `persona.json`) |
| `role` | string | ✓ | Role in the bundle context |
| `dir` | string | ✓ | Relative path to the member persona directory |
| `description` | string | | Human-readable description of this persona's role in the team |

### Optional Fields

| Field | Type | Description |
|---|---|---|
| `version` | string | Semver bundle version (default: `"0.1.0"`) |
| `author` | string | Bundle author (default: `"openpersona"`) |
| `coordination` | object | Inter-persona coordination settings (handoff protocol, shared constraints, escalation path) |
| `social` | object | ACN / social config for the bundle as a unit |

---

## Curation via CLI

Maintainers can add multi-persona bundles to the OpenPersona directory using the
curator command:

```bash
# Requires OPENPERSONA_CURATOR_TOKEN
openpersona curate owner/repo --type multi
```

The curator command validates that `bundle.json` exists with the required fields
and at least 2 persona entries, then submits the bundle to the directory with
`isCurated: true` and `packType: "multi"`.

Curated bundles appear in search results with `[multi]` and `[curated]` markers:

```
$ openpersona search team --type multi
  builder-team [bundle] [multi] [curated]
    A coordinated team of product, implementation, and review personas.
    $ openpersona install owner/builder-team  (browse bundle — installation not yet supported)
```

---

## Implementation Gate

Bundle installation (decomposing a bundle into individually installed personas)
is gated on **P11-B (Team Preset Bundle)** in the ROADMAP. The following CLI
commands are **not yet implemented** for multi packs:

- `openpersona install` — blocked; shows a friendly notice
- `openpersona fork` — not applicable to bundles
- `openpersona state read/write` — operates per-persona, not per-bundle

The `openpersona curate --type multi` and `openpersona search --type multi` paths
are fully operational today.
