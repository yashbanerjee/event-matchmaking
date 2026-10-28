#!/usr/bin/env bash
set -euo pipefail

# Encrypted PostgreSQL backup. Requires DATABASE_URL and BACKUP_DIR.
# Example: BACKUP_DIR=./backups ./infra/backup/backup-postgres.sh

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:=./backups}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required for encryption}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/event_matchmaking_${STAMP}.sql.gz.enc"

echo "Creating encrypted backup at $FILE"
pg_dump "$DATABASE_URL" | gzip | openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$BACKUP_PASSPHRASE" -out "$FILE"

find "$BACKUP_DIR" -name 'event_matchmaking_*.sql.gz.enc' -mtime +"$BACKUP_RETENTION_DAYS" -delete
echo "Backup complete"
