#!/usr/bin/env python3
"""
generate_report.py — Convierte audit/inventory.json y audit/results.json
en los .md finales que se entregan al usuario.

Produce:
    audit/inventory.md      — Path map agrupado por dominio
    audit/findings.md       — Hallazgos ordenados por severidad
    audit/summary.md        — Resumen ejecutivo

Uso:
    python scripts/generate_report.py \
        --inventory audit/inventory.json \
        --results audit/results.json \
        --out-dir audit/
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"]
SEVERITY_EMOJI = {"Critical": "🔴", "High": "🟠", "Medium": "🟡", "Low": "🔵"}


def infer_domain(path: str) -> str:
    p = path.lower()
    if "/auth" in p or "/login" in p or "/signup" in p or "/password" in p:
        return "auth"
    if "/payment" in p or "/charge" in p or "/billing" in p or "/refund" in p:
        return "payments"
    if "/webhook" in p:
        return "webhooks"
    if "/wallet" in p or "/pass" in p:
        return "wallet"
    if "/health" in p or "/status" in p or "/version" in p:
        return "health"
    if "/admin" in p:
        return "admin"
    if "/member" in p or "/user" in p or "/me" in p:
        return "users"
    if "/appointment" in p or "/booking" in p or "/schedule" in p or "/availab" in p:
        return "scheduling"
    if "/order" in p or "/cart" in p or "/checkout" in p:
        return "orders"
    if "/message" in p or "/whatsapp" in p or "/email" in p or "/sms" in p:
        return "messaging"
    if "/report" in p or "/export" in p or "/analytics" in p:
        return "reporting"
    return "other"


def generate_inventory_md(inventory: dict, out: Path) -> None:
    eps = inventory.get("endpoints", inventory) if isinstance(inventory, dict) else inventory

    by_domain = defaultdict(list)
    for ep in eps:
        by_domain[infer_domain(ep.get("path", ""))].append(ep)

    lines = ["# Endpoint inventory (path map)", ""]
    lines.append(f"**Total endpoints**: {len(eps)}")
    lines.append(f"**Dominios detectados**: {len(by_domain)}")
    lines.append("")

    for domain in sorted(by_domain.keys()):
        lines.append(f"## {domain.title()}")
        lines.append("")
        lines.append("| Method | Path | Auth | Tenant scope | Validation | DB | Externals | Notes |")
        lines.append("|---|---|---|---|---|---|---|---|")
        for ep in sorted(by_domain[domain], key=lambda e: e.get("path", "")):
            method = ep.get("method", "?")
            path = ep.get("path", "?")
            auth = "✓" if ep.get("auth_required") else "—"
            tenant = ep.get("tenant_scope") or "—"
            valid = ep.get("input_validation") or "unvalidated"
            db = ", ".join(ep.get("db_operations", [])) or "—"
            ext = ", ".join(ep.get("external_calls", [])) or "—"
            notes = ep.get("notes", "")
            lines.append(f"| `{method}` | `{path}` | {auth} | {tenant} | {valid} | {db} | {ext} | {notes} |")
        lines.append("")

    out.write_text("\n".join(lines))
    print(f"Wrote {out}")


def generate_findings_md(results: dict, out: Path) -> None:
    all_findings = []
    for r in results.get("results", []):
        for f in r["findings"]:
            all_findings.append({**f, "endpoint": r["endpoint"]})

    by_sev = defaultdict(list)
    for f in all_findings:
        by_sev[f["severity"]].append(f)

    lines = ["# Audit findings", ""]
    lines.append(f"**Base URL auditada**: {results.get('base_url', '?')}")
    lines.append(f"**Total findings**: {len(all_findings)}")
    lines.append("")
    lines.append("| Severidad | Cantidad |")
    lines.append("|---|---|")
    for sev in SEVERITY_ORDER:
        if sev in by_sev:
            lines.append(f"| {SEVERITY_EMOJI[sev]} {sev} | {len(by_sev[sev])} |")
    lines.append("")

    for sev in SEVERITY_ORDER:
        if sev not in by_sev:
            continue
        lines.append(f"## {SEVERITY_EMOJI[sev]} {sev}")
        lines.append("")
        for i, f in enumerate(by_sev[sev], 1):
            lines.append(f"### {sev[0]}{i}. {f['title']}")
            lines.append("")
            lines.append(f"**Endpoint**: `{f['endpoint']}`")
            lines.append("")
            lines.append(f"**Detalle**: {f['detail']}")
            lines.append("")
            if f.get("fix"):
                lines.append("**Fix sugerido**:")
                lines.append("```ts")
                lines.append(f["fix"])
                lines.append("```")
                lines.append("")

    out.write_text("\n".join(lines))
    print(f"Wrote {out}")


def generate_summary_md(inventory: dict, results: dict, out: Path) -> None:
    eps = inventory.get("endpoints", inventory) if isinstance(inventory, dict) else inventory
    all_findings = [f for r in results.get("results", []) for f in r["findings"]]
    by_sev = defaultdict(int)
    for f in all_findings:
        by_sev[f["severity"]] += 1

    # Top issues por endpoint
    by_endpoint = defaultdict(list)
    for r in results.get("results", []):
        for f in r["findings"]:
            by_endpoint[r["endpoint"]].append(f["severity"])
    top_problematic = sorted(
        by_endpoint.items(),
        key=lambda x: (-sum(1 for s in x[1] if s == "Critical"), -sum(1 for s in x[1] if s == "High"), -len(x[1]))
    )[:5]

    lines = ["# Audit summary", ""]
    lines.append(f"- **Endpoints inventariados**: {len(eps)}")
    lines.append(f"- **Endpoints probados**: {results.get('total_endpoints', 0)}")
    lines.append(f"- **Findings**: {len(all_findings)} totales")
    for sev in SEVERITY_ORDER:
        if by_sev.get(sev):
            lines.append(f"  - {SEVERITY_EMOJI[sev]} {sev}: {by_sev[sev]}")
    lines.append("")
    if top_problematic:
        lines.append("## Top endpoints con más findings")
        lines.append("")
        for ep, sevs in top_problematic:
            lines.append(f"- `{ep}` — {len(sevs)} findings ({', '.join(sevs)})")
        lines.append("")
    lines.append("## Próximos pasos")
    lines.append("")
    lines.append("1. Revisa `findings.md` y arregla los Critical primero.")
    lines.append("2. Revisa `recommendations.md` para los endpoints faltantes.")
    lines.append("3. Vuelve a correr la skill después de aplicar fixes para validar.")
    out.write_text("\n".join(lines))
    print(f"Wrote {out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--results", default=None)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    inv = json.loads(Path(args.inventory).read_text())
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    generate_inventory_md(inv, out_dir / "inventory.md")

    if args.results:
        res = json.loads(Path(args.results).read_text())
        generate_findings_md(res, out_dir / "findings.md")
        generate_summary_md(inv, res, out_dir / "summary.md")


if __name__ == "__main__":
    main()
