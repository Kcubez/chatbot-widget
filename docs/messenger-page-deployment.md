# Deploying one bot per Facebook Page

The change leaves existing Page tokens, enabled flags, registrations, and the Messenger webhook processing code unchanged. A paused bot retains its Page assignment until disconnected. Reconnecting the same Page to the same bot is allowed.

Before deploying the migration, run the read-only preflight against the intended deployment database:

```sh
node --import tsx scripts/check-messenger-page-migration.ts
```

The script uses DATABASE_URL (or the local .env fallback). Confirm that this is the production database when assessing production. It reports counts only, without tokens or Page IDs. The local connection could not be verified during implementation, so existing production duplicates remain unconfirmed.

If duplicate_page_groups is nonzero, explicitly choose which bot should keep each Page and disconnect the others before migrating. The migration does not delete or disconnect bots automatically. Existing duplicates cause the unique index creation to fail. Invalid Page IDs should also be reviewed before reconnecting those bots.

The repository's build command is next build, and postinstall runs prisma generate; neither applies database migrations. Apply the new migration through the project's established database migration process. Do not assume pushing code activates the database constraint. Until the index exists, the API pre-check alone cannot prevent simultaneous assignments.

Creating the unique index may briefly lock writes to the bot table. Schedule the migration appropriately for production. If an earlier migration is already pending or failed, resolve that state before applying this one.

After deployment, verify an existing Page still replies, reconnecting the same bot works, and attempting to connect that Page to a different bot returns HTTP 409. The conflict tests mock database responses; they do not replace a live migration or Messenger smoke test.
