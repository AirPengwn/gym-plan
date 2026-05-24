# Rollback snapshot — v2.73 (2026-05-21)

Captured immediately before the adjustable-day-count refactor, as a disaster-recovery
point. At capture time the cloud bin was verified clean: 23/23 set-bearing entries with
`.sets`, 0 doubled units, 0 labeled Rear+Pec entries, 0 duplicate sessions.

## Files

- **`index-v2.73.html`** — byte-identical copy of the working v2.73 app (454,270 bytes).
- **`jsonbin-cloud-backup.json`** — full JSONbin cloud payload at capture time
  (schema 2; Day A/B/D/E = 1 session each, Day C = 0; 0 measurements, 0 archived).

## How to roll back the CODE

Replace `index.html` with this snapshot, then push to GitHub:

```
cp backups/v2.73-2026-05-21/index-v2.73.html index.html
```

(Or restore the v2.73 commit from GitHub directly — manual uploads keep prior builds.)

## How to roll back the DATA (restore cloud to this snapshot)

The cloud bin can be overwritten with this exact payload. Two options:

**Option A — via the app (Restore panel):**
1. Open the app on the PRIMARY device.
2. Base64-encode the contents of `jsonbin-cloud-backup.json`
   (e.g. paste the JSON into any base64 encoder).
3. Backup modal → Restore tab → paste the base64 → Restore.
4. The app writes it to localStorage and syncs to cloud.

**Option B — direct PUT (Node, same pattern as restore_cloud.js):**
```js
// reads JBIN_ID/JBIN_KEY from index.html, PUTs this file's contents back
// (no X-Bin-Versioning header — free tier rejects it with 403)
```

## Verification after restore

Re-run the live review (focused, no full dump):
- Set-bearing entries with .sets : 23/23 ✓
- Doubled-unit notes ("lbs lbs") : 0 ✓
- Combined Rear+Pec labeled notes: 0 ✓
- Duplicate session groups       : 0 ✓
