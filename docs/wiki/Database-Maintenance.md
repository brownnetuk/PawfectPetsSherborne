# Database maintenance

MongoDB only runs inside the Docker stack and has no port open to the outside, so one-off data fixes are done from the **mongo container's console in Portainer**.

## Opening a database shell

1. Portainer > **Containers** > the stack's **mongo** container > **Console** > Connect (`/bin/sh`).
2. Run:

   ```bash
   mongosh -u pawfectpets -p --authenticationDatabase admin pawfectpets
   ```

3. Paste the `MONGO_ROOT_PASSWORD` value from the stack's environment variables when asked.

## How fixes are written

Every one-off fix follows the same three steps, so nothing is changed by accident:

1. **Check:** a read-only script that prints what it found. Carry on only if the output matches what the instructions say.
2. **Apply:** the script that makes the change.
3. **Verify:** a read-only script that confirms the result.

Past examples (from the project files): renaming a booking reference, backfilling invoice due dates, and backfilling pre-check-in progress.

## Useful collections

| Collection | Holds |
| --- | --- |
| `customers`, `animals` | Customers and pets |
| `boardingbookings`, `daybookings` | Boarding and day care bookings, and calendar rows |
| `invoices`, `quotes`, `payments`, `creditnotes` | Documents and money |
| `formsubmissions` | Every sent or completed form |
| `auditlogentries` | The Activity log |
| `businessinfos` | The single Business Info settings document (numbering, booking reference counter, terms) |

## Backups

Take a backup before any fix:

```bash
mongodump -u pawfectpets -p --authenticationDatabase admin --db pawfectpets --archive=/data/db/backup-$(date +%F).archive --gzip
```

This writes into the `mongo_data` volume; copy it off the host for safekeeping. Restore with `mongorestore --archive=... --gzip`.

## Scripts in the repo

`backend/scripts/` has Node scripts for jobs that are easier in code, such as `rename-booking-reference.js` (a dry run by default; add `--apply` to write). They need a checkout of `backend/` and a `MONGODB_URI` that can reach the database, because they aren't in the production image.
