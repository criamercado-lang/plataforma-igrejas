#!/usr/bin/env bash
# Prepara o teste no navegador: banco limpo + app compilado apontando para o servidor de teste.
# Uso: PGHOST=/tmp PGPORT=54329 PGUSER=postgres tests/e2e/preparar.sh <pasta-do-build>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$1"
DB="${E2E_DB:-plataforma_e2e}"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/tests/db/supabase_stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1; done

rm -rf "$OUT" && mkdir -p "$OUT"
cd "$ROOT"
bun build src/main.tsx --outdir "$OUT" --target browser \
  --define 'import.meta.env.VITE_SUPABASE_URL="http://localhost:8787/sb"' \
  --define 'import.meta.env.VITE_SUPABASE_ANON_KEY="anon-teste"' \
  --define 'import.meta.env.VITE_TURNSTILE_SITE_KEY=""' \
  --define 'process.env.NODE_ENV="production"' >/dev/null
sed -e 's#<script type="module" src="/src/main.tsx"></script>#<link rel="stylesheet" href="/main.css" /><script type="module" src="/main.js"></script>#' index.html > "$OUT/index.html"
cp public/* "$OUT/" 2>/dev/null || true
echo "pronto: $OUT"
