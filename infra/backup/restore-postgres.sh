#!/usr/bin/env bash
set -euo pipefail

# Restore into an ISOLATED database URL only.
# Never point RESTORE_DATABASE_URL at production without an approved process.

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

if [[ "$RESTORE_DATABASE_URL" == *"prod"* && "${ALLOW_PROD_RESTORE:-}" != "yes" ]]; then
  echo "Refusing restore that looks like production. Set ALLOW_PROD_RESTORE=yes to override."
  exit 1
fi

echo "Restoring $BACKUP_FILE into isolated target"
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_PASSPHRASE" -in "$BACKUP_FILE" \
  | gunzip \
  | psql "$RESTORE_DATABASE_URL"

echo "Restore complete. Validate schema, critical business records, and application health before cutover."
