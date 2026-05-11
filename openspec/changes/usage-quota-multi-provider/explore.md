# Explore — usage-quota-multi-provider

## Goal
Construir un plugin/extensión de Pi que exponga `/usage` con cuotas reales de suscripción por provider (cuando exista endpoint) y fallback a consumo local, sin depender de rutas específicas de Hermes.

## Findings (técnicos)
1. Pi no trae `/usage` de cuenta por defecto; sí muestra tokens/costo de sesión en footer y `/session`.
2. Hermes implementa `/usage` con adaptadores por provider:
   - openai-codex: endpoint `chatgpt.com/backend-api/wham/usage`
   - anthropic oauth: endpoint `api.anthropic.com/api/oauth/usage`
   - openrouter: endpoints `.../credits` y `.../key`
3. Para comunidad Pi, no conviene depender de `~/.hermes/auth.json`; hay que leer credenciales desde contexto estándar de Pi/env/config o exigir setup explícito.
4. Timezone debe ser portable: `PI_USAGE_TZ` > `TZ` > `Intl` > `UTC`.
5. UX objetivo: salida humana (no JSON crudo), barras visuales, `left %`, reset time + countdown.

## Riesgos
- Variabilidad de auth por provider (OAuth vs API key).
- Endpoints privados/no documentados pueden cambiar (especialmente codex usage backend).
- Entornos sin `curl`; conviene usar fetch/http en Node.

## No-goals (fase inicial)
- No agregar telemetría remota propia.
- No mutar credenciales del usuario.
- No inferir plan/cuenta si el provider no lo devuelve.
