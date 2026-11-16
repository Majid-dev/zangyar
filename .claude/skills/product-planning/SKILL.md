# Product planning skill

Use this skill when shaping ZangYar product scope or workflows.

1. Read `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DECISIONS.md`, and `docs/ROADMAP.md` before proposing changes.
2. Separate confirmed decisions from unresolved questions; do not silently invent business rules.
3. Preserve the product boundaries: Persian RTL school SaaS, school tenancy, global users, one school role per membership, school-local guardians, and no parent portal in the MVP.
4. Describe actors, permissions, lifecycle, failure states, audit impact, and tenant-isolation implications for each workflow.
5. Update the smallest relevant documentation files when a decision is approved, and record significant architectural choices in `docs/DECISIONS.md`.
6. Do not implement application code when the task is product analysis only.
