# Tenant security review skill

Use this skill when reviewing any ZangYar server operation, query, route, action, or schema change.

1. Verify authentication before authorization.
2. Resolve the active school only from a verified membership; never trust a client-supplied `schoolId`.
3. Confirm every school-owned read, write, update, and delete is scoped by the active school.
4. Confirm role checks use server-side membership data. School Admin and Teacher are mutually exclusive school roles.
5. Check resource ownership, teacher classroom assignment, enrollment validity, and same-tenant relationships.
6. Review composite foreign keys, unique constraints, indexes, and deletion behavior for cross-tenant leakage.
7. Test both permitted same-tenant access and denied cross-tenant access.
8. Check audit events for membership, attendance correction, enrollment, configuration, and platform operations.
9. Report unresolved risks clearly; do not rely on hidden navigation or frontend filtering as security.
