#!/usr/bin/env bash
# Recria o banco de testes, monta o site, sobe o servidor local e roda o teste no navegador.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$PATH:/root/.bun/bin"
PRINTS="${1:-$RAIZ/tests/e2e/prints}"

pkill -f "bun dev/servidor.ts" 2>/dev/null || true
sleep 0.5
"$RAIZ/dev/preparar-banco.sh" >/dev/null
(cd "$RAIZ" && bun dev/build.ts >/dev/null)
(cd "$RAIZ" && bun dev/servidor.ts > "${TMPDIR:-/tmp}/servidor-teste.log" 2>&1 &)
for i in $(seq 1 30); do curl -s -o /dev/null localhost:8888/ && break; sleep 0.3; done

cd "$RAIZ"
PLAYWRIGHT="${PLAYWRIGHT:-/home/claude/.npm-global/lib/node_modules/playwright}" node tests/e2e/fluxo-fase1.cjs "$PRINTS"
