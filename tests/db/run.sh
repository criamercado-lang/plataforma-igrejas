#!/usr/bin/env bash
# Recria um banco de teste, aplica o stub do Supabase + as migrações e roda os testes.
# Uso: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/db/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${TEST_DB:-plataforma_test}"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/tests/db/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migração: $(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done

for t in "$ROOT"/tests/db/test_*.sql; do
  echo "teste: $(basename "$t")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t"
done
echo "OK: todos os testes do banco passaram"
