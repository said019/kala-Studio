# audit-report-template.md

Template del informe ejecutivo que cierra la auditoría. Adáptalo, no lo copies tal cual.

---

# Auditoría de endpoints — {{project_name}}

**Fecha**: {{date}}
**Base URL**: {{base_url}}
**Stack detectado**: {{stack}}
**Endpoints inventariados**: {{total}}

## Resumen ejecutivo

{{una_o_dos_lineas_del_estado_general}}

### Findings por severidad

| Severidad | Cantidad |
|---|---|
| 🔴 Critical | {{critical}} |
| 🟠 High | {{high}} |
| 🟡 Medium | {{medium}} |
| 🔵 Low | {{low}} |

### Top 3 cosas a arreglar YA

1. {{critical_finding_1_con_endpoint_y_archivo}}
2. {{critical_finding_2}}
3. {{critical_finding_3}}

### Top 3 endpoints faltantes (prioritarios)

1. {{missing_endpoint_1_con_porque}}
2. {{missing_endpoint_2}}
3. {{missing_endpoint_3}}

## Cobertura por dominio

| Dominio | Endpoints existentes | Recomendados faltantes |
|---|---|---|
| Auth | {{existing}} | {{missing}} |
| Pagos | {{existing}} | {{missing}} |
| Webhooks | {{existing}} | {{missing}} |
| Wallet | {{existing}} | {{missing}} |
| Health | {{existing}} | {{missing}} |
| Admin | {{existing}} | {{missing}} |
| Citas | {{existing}} | {{missing}} |

## Métricas de salud (audit dinámico)

- Latencia P50 promedio: **{{p50}}ms**
- Latencia P95 promedio: **{{p95}}ms**
- Endpoints con 5xx en producción: **{{count_5xx}}**
- Endpoints inalcanzables: **{{count_unreachable}}**
- Endpoints con CORS abierto: **{{count_cors_open}}**

## Archivos generados

- `audit/inventory.md` — Path map completo
- `audit/findings.md` — Findings detallados con código vulnerable y fix
- `audit/recommendations.md` — Endpoints faltantes con esqueletos copy-paste
- `audit/inventory.json` — Inventario crudo (usable en CI/CD)
- `audit/results.json` — Resultados crudos del audit dinámico

## Siguientes pasos

1. **Arreglar Criticals** en orden — bloquean producción.
2. **Implementar endpoints P0** del catálogo de recomendaciones (health, recovery, reconciliación).
3. **Agregar tests automatizados** que repliquen los chequeos de esta auditoría (CI gate).
4. **Re-correr esta skill mensualmente** o tras cambios grandes para mantener el score.

---
*Generado con la skill `endpoint-auditor`. Para volver a correr, pídele a Claude Code: "audita los endpoints de nuevo".*
