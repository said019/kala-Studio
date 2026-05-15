# inventory.json — schema

Estructura esperada de `audit/inventory.json` que generas tras Fase 2.

```json
{
  "project": "wallet-club",
  "framework": "nextjs-app",
  "base_url_prod": "https://wallet.club",
  "discovered_at": "2026-05-12T10:30:00Z",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/health",
      "file": "app/api/health/route.ts",
      "line": 1,
      "auth_required": false,
      "tenant_scope": null,
      "input_validation": "n/a",
      "db_operations": [],
      "external_calls": [],
      "side_effects": [],
      "error_handling": "basic",
      "idempotent": true,
      "is_webhook": false,
      "rate_limited": false,
      "notes": "Health check endpoint"
    },
    {
      "method": "POST",
      "path": "/api/auth/login",
      "file": "app/api/auth/login/route.ts",
      "line": 15,
      "auth_required": false,
      "tenant_scope": null,
      "input_validation": "zod",
      "db_operations": ["prisma.user.findUnique"],
      "external_calls": [],
      "side_effects": ["sets cookie"],
      "error_handling": "uniform",
      "idempotent": false,
      "is_webhook": false,
      "rate_limited": true,
      "sample_body": {"email": "test@example.com", "password": "test123"},
      "notes": "Login endpoint, returns JWT"
    },
    {
      "method": "POST",
      "path": "/api/webhooks/mercadopago",
      "file": "app/api/webhooks/mercadopago/route.ts",
      "line": 1,
      "auth_required": false,
      "tenant_scope": "via external_reference",
      "input_validation": "schema + signature",
      "db_operations": ["prisma.payment.update"],
      "external_calls": ["mercadopago.payment.get"],
      "side_effects": ["activates membership", "sends WhatsApp"],
      "error_handling": "uniform",
      "idempotent": true,
      "is_webhook": true,
      "webhook_provider": "mercadopago",
      "signature_verified": true,
      "rate_limited": false,
      "notes": "MP payment webhook, idempotent by event_id"
    }
  ]
}
```

## Campos opcionales pero útiles

- `auth_token_var`: nombre de la var de entorno con el bearer token a usar al testear (`USER_TOKEN`, `ADMIN_TOKEN`, etc.)
- `path_params`: dict con valores de muestra para `:param` segments (`{"gymId": "abc-123"}`)
- `sample_body`: payload de prueba para POSTs idempotentes
- `expected_status`: status esperado en caso feliz (default 200)
- `destructive`: bool — fuerza que se excluya del audit activo aunque no sea DELETE
