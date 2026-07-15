# Security schema update

The repository does not currently have a Prisma migration history. Apply
`security-hardening.sql` to the existing PostgreSQL database during a
maintenance window before deploying this application build.

First run the duplicate-seat query at the top of the SQL file. The migration
intentionally stops if active data violates the new one-seat/one-user
invariant; resolve those records instead of dropping or rewriting them
automatically.

The SQL is transactional and can complete an installation where an older
version of `EmailChangePin` or `EmailChangeToken` already exists. It does not
delete existing rows. If an old `EmailChangeToken` table contains rows that
cannot satisfy the newly required columns, the transaction stops and rolls
back so those records can be reviewed explicitly.

Existing guardian addresses are intentionally left unverified. An
administrator must open each existing user, confirm the guardian address, and
save it before that student can request permission or check in. This avoids
silently treating historical student-supplied addresses as verified guardian
identities.
