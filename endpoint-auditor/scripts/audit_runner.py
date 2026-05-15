#!/usr/bin/env python3
"""
audit_runner.py — Audit dinámico contra producción.

Lee audit/inventory.json, hace requests con métricas, y escribe audit/results.json.
SAFE-MODE por defecto: solo GETs y POSTs marcados explícitamente como seguros.

Uso:
    python scripts/audit_runner.py \
        --inventory audit/inventory.json \
        --base-url https://wallet.club \
        --env-file .env.audit \
        --output audit/results.json \
        [--safe-mode]              # excluye DELETE, payments, side-effects
        [--include-pattern <re>]    # solo audita rutas que matcheen
        [--exclude-pattern <re>]    # excluye rutas que matcheen
        [--timeout 10]
        [--max-concurrency 5]
        [--repeat 3]                # cada endpoint se llama N veces para medir P50/P95
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path
from typing import Any

try:
    import httpx
except ImportError:
    print("ERROR: requires httpx. Install: pip install httpx", file=sys.stderr)
    sys.exit(1)


DESTRUCTIVE_METHODS = {"DELETE"}
DESTRUCTIVE_PATH_KEYWORDS = (
    "payments", "charge", "refund", "delete", "cancel", "destroy",
    "membership/activate", "subscription", "webhook"
)


def load_env(env_file: str | None) -> dict[str, str]:
    if not env_file:
        return {}
    env = {}
    path = Path(env_file)
    if not path.exists():
        print(f"WARN: env file {env_file} not found", file=sys.stderr)
        return {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip("\"'")
    return env


def is_destructive(ep: dict[str, Any]) -> bool:
    method = ep.get("method", "").upper()
    path = ep.get("path", "").lower()
    if method in DESTRUCTIVE_METHODS:
        return True
    if method in {"POST", "PUT", "PATCH"}:
        for kw in DESTRUCTIVE_PATH_KEYWORDS:
            if kw in path:
                return True
    return False


def fill_path_params(path: str, samples: dict[str, str]) -> str:
    """Reemplaza :param con valores de samples; si no hay match, usa 'test'."""
    def replacer(m):
        name = m.group(1)
        return samples.get(name, "test")
    return re.sub(r":(\w+)", replacer, path).replace("*", "test")


async def audit_one(
    client: httpx.AsyncClient,
    ep: dict[str, Any],
    base_url: str,
    env: dict[str, str],
    repeat: int,
    timeout: float,
) -> dict[str, Any]:
    method = ep.get("method", "GET").upper()
    raw_path = ep.get("path", "/")

    # Param sampling: el inventory puede traer { "path_params": {"id": "abc"} }
    samples = ep.get("path_params", {})
    path = fill_path_params(raw_path, samples)
    url = base_url.rstrip("/") + path

    # Headers: auth si está disponible
    headers = {"User-Agent": "endpoint-auditor/1.0"}
    if ep.get("auth_token_var"):
        token = env.get(ep["auth_token_var"])
        if token:
            headers["Authorization"] = f"Bearer {token}"

    # Body sample para POSTs idempotentes
    body = ep.get("sample_body")

    latencies: list[float] = []
    statuses: list[int] = []
    errors: list[str] = []
    sample_response = None
    sample_headers = None

    for i in range(repeat):
        t0 = time.perf_counter()
        try:
            resp = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=body if body else None,
                timeout=timeout,
            )
            elapsed = (time.perf_counter() - t0) * 1000
            latencies.append(elapsed)
            statuses.append(resp.status_code)
            if i == 0:
                sample_headers = dict(resp.headers)
                try:
                    sample_response = resp.json()
                except Exception:
                    sample_response = resp.text[:500]
        except httpx.TimeoutException:
            errors.append(f"timeout after {timeout}s")
            latencies.append(timeout * 1000)
            statuses.append(0)
        except Exception as e:
            errors.append(f"{type(e).__name__}: {e}")
            statuses.append(0)

    # Análisis
    findings = analyze_response(ep, statuses, latencies, sample_headers, sample_response)

    return {
        "endpoint": f"{method} {raw_path}",
        "tested_url": url,
        "method": method,
        "statuses": statuses,
        "latency_ms": {
            "min": min(latencies) if latencies else None,
            "p50": statistics.median(latencies) if latencies else None,
            "p95": statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else (max(latencies) if latencies else None),
            "max": max(latencies) if latencies else None,
        },
        "errors": errors,
        "sample_status": statuses[0] if statuses else None,
        "sample_response_preview": str(sample_response)[:300] if sample_response else None,
        "findings": findings,
    }


def analyze_response(
    ep: dict[str, Any],
    statuses: list[int],
    latencies: list[float],
    headers: dict | None,
    sample_response: Any,
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    method = ep.get("method", "GET").upper()
    expects_auth = ep.get("auth_required", False)
    status = statuses[0] if statuses else 0

    # 1. Status code
    if status >= 500:
        findings.append({
            "severity": "High",
            "title": f"5xx en endpoint ({status})",
            "detail": "Endpoint devolvió error de servidor en chequeo básico. Indica bug, dependencia caída o estado inválido."
        })
    elif status == 0:
        findings.append({
            "severity": "Critical",
            "title": "Endpoint inalcanzable",
            "detail": "No respondió en el timeout configurado. Puede estar caído o tener una ruta mal configurada."
        })
    elif status == 404 and method == "GET":
        findings.append({
            "severity": "Medium",
            "title": "404 inesperado",
            "detail": "El endpoint existe en el código pero no responde en producción. ¿Está desplegado? ¿El path tiene un prefijo?"
        })

    # 2. Auth
    if expects_auth and status not in {401, 403} and "Authorization" not in (ep.get("_sent_headers") or {}):
        # Si se esperaba auth y no se envió, debería rechazar
        if status < 400:
            findings.append({
                "severity": "Critical",
                "title": "Endpoint protegido responde sin auth",
                "detail": "Marcado como auth-required pero respondió 2xx sin Authorization header."
            })

    # 3. Latencia
    if latencies:
        p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
        threshold = 3000 if method in {"POST", "PUT", "PATCH"} else 1000
        if p95 > threshold:
            findings.append({
                "severity": "Medium",
                "title": f"Latencia alta P95={int(p95)}ms",
                "detail": f"Excede el umbral de {threshold}ms para {method}. Revisa queries, índices, o llamadas externas síncronas."
            })

    # 4. Security headers (solo si el endpoint sirve a navegador)
    if headers and status < 400:
        if "strict-transport-security" not in {k.lower() for k in headers}:
            findings.append({
                "severity": "Low",
                "title": "Falta header Strict-Transport-Security",
                "detail": "Configura HSTS en el edge (Vercel, Cloudflare) o en el handler."
            })
        cors = headers.get("access-control-allow-origin") or headers.get("Access-Control-Allow-Origin")
        if cors == "*" and expects_auth:
            findings.append({
                "severity": "Critical",
                "title": "CORS abierto en endpoint autenticado",
                "detail": "Access-Control-Allow-Origin:* combinado con credenciales permite leakage cross-site. Restringe a tu dominio."
            })

    # 5. Response leakage
    preview = str(sample_response)[:500].lower() if sample_response else ""
    leak_keywords = ["traceback", "stack trace", "at /", "syntaxerror", "prismaclient", "supabase_url", "service_role"]
    for kw in leak_keywords:
        if kw in preview:
            findings.append({
                "severity": "High",
                "title": f"Posible filtración en respuesta: '{kw}'",
                "detail": "La respuesta de error expone detalles internos. Filtra el mensaje antes de devolverlo."
            })
            break

    return findings


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--env-file", default=None)
    parser.add_argument("--output", required=True)
    parser.add_argument("--safe-mode", action="store_true")
    parser.add_argument("--include-pattern", default=None)
    parser.add_argument("--exclude-pattern", default=None)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--max-concurrency", type=int, default=5)
    parser.add_argument("--repeat", type=int, default=3)
    args = parser.parse_args()

    inventory = json.loads(Path(args.inventory).read_text())
    env = load_env(args.env_file)

    endpoints = inventory.get("endpoints", inventory) if isinstance(inventory, dict) else inventory

    # Filtros
    include_re = re.compile(args.include_pattern) if args.include_pattern else None
    exclude_re = re.compile(args.exclude_pattern) if args.exclude_pattern else None

    filtered = []
    skipped = []
    for ep in endpoints:
        path = ep.get("path", "")
        if include_re and not include_re.search(path):
            continue
        if exclude_re and exclude_re.search(path):
            skipped.append({"endpoint": f"{ep.get('method')} {path}", "reason": "matched exclude-pattern"})
            continue
        if args.safe_mode and is_destructive(ep):
            skipped.append({"endpoint": f"{ep.get('method')} {path}", "reason": "destructive (safe-mode)"})
            continue
        filtered.append(ep)

    print(f"Auditing {len(filtered)} endpoints ({len(skipped)} skipped)...", file=sys.stderr)

    sem = asyncio.Semaphore(args.max_concurrency)
    async with httpx.AsyncClient(follow_redirects=False) as client:
        async def bounded(ep):
            async with sem:
                return await audit_one(client, ep, args.base_url, env, args.repeat, args.timeout)

        results = await asyncio.gather(*[bounded(ep) for ep in filtered])

    output = {
        "base_url": args.base_url,
        "audited_at": int(time.time()),
        "total_endpoints": len(filtered),
        "skipped": skipped,
        "results": results,
    }

    Path(args.output).write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"Wrote results to {args.output}", file=sys.stderr)

    # Resumen
    total_findings = sum(len(r["findings"]) for r in results)
    by_sev: dict[str, int] = {}
    for r in results:
        for f in r["findings"]:
            by_sev[f["severity"]] = by_sev.get(f["severity"], 0) + 1
    print(f"\nTotal findings: {total_findings}", file=sys.stderr)
    for sev in ("Critical", "High", "Medium", "Low"):
        if sev in by_sev:
            print(f"  {sev}: {by_sev[sev]}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
