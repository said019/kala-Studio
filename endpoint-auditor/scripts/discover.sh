#!/usr/bin/env bash
# discover.sh — Auto-detección de endpoints en el repo actual
# Uso: bash scripts/discover.sh [project_root]
# Output: lista de endpoints encontrados con metadata cruda en formato:
#   <framework>|<method>|<path>|<file>

set -e

ROOT="${1:-.}"
cd "$ROOT"

echo "# Endpoint discovery — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "# Root: $(pwd)"
echo ""

# ─── Next.js App Router ─────────────────────────────────────────────
if [ -d "app" ] || [ -d "src/app" ]; then
  echo "## Next.js App Router"
  for base in app src/app; do
    [ -d "$base" ] || continue
    find "$base" -type f \( -name "route.ts" -o -name "route.js" -o -name "route.tsx" \) 2>/dev/null | while read -r f; do
      # path = ruta relativa al app/, quitando /route.ts y /(group)/
      rel="${f#$base/}"
      rel="${rel%/route.*}"
      # quitar grupos (parens)
      api_path=$(echo "/$rel" | sed -E 's|/\([^)]+\)||g')
      # convertir [param] a :param
      api_path=$(echo "$api_path" | sed -E 's|\[\.\.\.([^]]+)\]|*\1|g' | sed -E 's|\[([^]]+)\]|:\1|g')

      # detectar métodos exportados
      methods=$(grep -E "^export\s+(async\s+)?(function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)" "$f" 2>/dev/null \
        | grep -oE "(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)" | sort -u)

      for m in $methods; do
        echo "nextjs-app|$m|$api_path|$f"
      done
    done
  done
  echo ""
fi

# ─── Next.js Pages Router ───────────────────────────────────────────
if [ -d "pages/api" ] || [ -d "src/pages/api" ]; then
  echo "## Next.js Pages Router"
  for base in pages/api src/pages/api; do
    [ -d "$base" ] || continue
    find "$base" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" \) 2>/dev/null | while read -r f; do
      rel="${f#${base%/api}/}"
      rel="${rel%.*}"
      api_path="/$rel"
      api_path=$(echo "$api_path" | sed -E 's|\[\.\.\.([^]]+)\]|*\1|g' | sed -E 's|\[([^]]+)\]|:\1|g')
      methods=$(grep -oE "req\.method\s*===\s*['\"]([A-Z]+)" "$f" 2>/dev/null | grep -oE "[A-Z]+" | sort -u)
      [ -z "$methods" ] && methods="ANY"
      for m in $methods; do
        echo "nextjs-pages|$m|$api_path|$f"
      done
    done
  done
  echo ""
fi

# ─── Fastify ────────────────────────────────────────────────────────
FASTIFY_HITS=$(grep -rEn "fastify\.(get|post|put|patch|delete|head|options|all)\(['\"]" \
  src routes api 2>/dev/null | head -200 || true)
if [ -n "$FASTIFY_HITS" ]; then
  echo "## Fastify"
  echo "$FASTIFY_HITS" | while IFS= read -r line; do
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    code="${rest#*:}"
    method=$(echo "$code" | grep -oE "fastify\.(get|post|put|patch|delete|head|options|all)" | head -1 | sed 's/fastify\.//' | tr '[:lower:]' '[:upper:]')
    path=$(echo "$code" | grep -oE "['\"][^'\"]*['\"]" | head -1 | tr -d "'\"")
    echo "fastify|$method|$path|$file:$lineno"
  done
  echo ""
fi

# ─── Express ────────────────────────────────────────────────────────
EXPRESS_HITS=$(grep -rEn "(app|router)\.(get|post|put|patch|delete|all)\(['\"]" \
  src routes api 2>/dev/null | head -200 || true)
if [ -n "$EXPRESS_HITS" ]; then
  echo "## Express"
  echo "$EXPRESS_HITS" | while IFS= read -r line; do
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    code="${rest#*:}"
    method=$(echo "$code" | grep -oE "\.(get|post|put|patch|delete|all)\(" | head -1 | tr -d '().' | tr '[:lower:]' '[:upper:]')
    path=$(echo "$code" | grep -oE "['\"][^'\"]*['\"]" | head -1 | tr -d "'\"")
    echo "express|$method|$path|$file:$lineno"
  done
  echo ""
fi

# ─── Supabase Edge Functions ────────────────────────────────────────
if [ -d "supabase/functions" ]; then
  echo "## Supabase Edge Functions"
  find supabase/functions -mindepth 2 -name "index.ts" 2>/dev/null | while read -r f; do
    fn_name=$(basename "$(dirname "$f")")
    echo "supabase-edge|ANY|/functions/v1/$fn_name|$f"
  done
  echo ""
fi

# ─── Supabase RPCs ──────────────────────────────────────────────────
RPC_HITS=$(grep -rEn "CREATE\s+(OR\s+REPLACE\s+)?FUNCTION" supabase/migrations db 2>/dev/null | head -100 || true)
if [ -n "$RPC_HITS" ]; then
  echo "## Supabase RPC functions"
  echo "$RPC_HITS" | while IFS= read -r line; do
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    code="${rest#*:}"
    fn_name=$(echo "$code" | grep -oiE "function\s+[a-z_][a-z0-9_]*" | head -1 | awk '{print $2}')
    [ -n "$fn_name" ] && echo "supabase-rpc|POST|/rest/v1/rpc/$fn_name|$file:$lineno"
  done
  echo ""
fi

# ─── tRPC ───────────────────────────────────────────────────────────
TRPC_HITS=$(grep -rEn "\.(query|mutation|subscription)\(" src/server src/trpc server/trpc 2>/dev/null | head -100 || true)
if [ -n "$TRPC_HITS" ]; then
  echo "## tRPC procedures"
  echo "$TRPC_HITS" | head -50 | while IFS= read -r line; do
    file="${line%%:*}"
    echo "trpc|POST|<from-router-context>|$file"
  done
  echo ""
fi

# ─── NestJS ─────────────────────────────────────────────────────────
NEST_HITS=$(grep -rEn "@(Get|Post|Put|Patch|Delete|All|Options|Head)\(" src 2>/dev/null | head -100 || true)
if [ -n "$NEST_HITS" ]; then
  echo "## NestJS"
  echo "$NEST_HITS" | while IFS= read -r line; do
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    code="${rest#*:}"
    method=$(echo "$code" | grep -oE "@(Get|Post|Put|Patch|Delete|All|Options|Head)" | head -1 | tr -d '@' | tr '[:lower:]' '[:upper:]')
    path=$(echo "$code" | grep -oE "['\"][^'\"]*['\"]" | head -1 | tr -d "'\"")
    [ -z "$path" ] && path="/"
    echo "nestjs|$method|$path|$file:$lineno"
  done
  echo ""
fi

# ─── Server actions ('use server') ──────────────────────────────────
SERVER_ACTIONS=$(grep -rln "['\"]use server['\"]" app src 2>/dev/null | head -50 || true)
if [ -n "$SERVER_ACTIONS" ]; then
  echo "## Server actions (Next.js)"
  for f in $SERVER_ACTIONS; do
    echo "nextjs-action|POST|<server-action>|$f"
  done
  echo ""
fi

# ─── Webhooks recibidos (heurística por strings) ────────────────────
WEBHOOK_FILES=$(grep -rlEi "(mercadopago|mp[._-]?webhook|stripe[._-]?webhook|totalpass|wellhub|gympass|evolution[._-]?webhook|whatsapp[._-]?webhook|twilio[._-]?webhook)" app pages src 2>/dev/null | head -50 || true)
if [ -n "$WEBHOOK_FILES" ]; then
  echo "## Webhook receivers (heurística)"
  for f in $WEBHOOK_FILES; do
    echo "webhook-receiver|POST|<detect-from-path>|$f"
  done
  echo ""
fi

echo "# DONE — copia esto a audit/inventory-raw.txt y procesa con generate_report.py"
