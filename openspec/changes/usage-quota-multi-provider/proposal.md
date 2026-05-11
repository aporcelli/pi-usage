# Proposal — usage-quota-multi-provider

## Problem
Pi no ofrece un comando nativo equivalente a `/usage` de Hermes/Codex para ver cuota real de suscripción (ventanas, porcentaje restante y reset).

## Proposed solution
Crear un paquete Pi (`pi-package`) con extensión que registre `/usage` y un motor de adapters por provider:

- `usage limits [provider]` → cuota real (si disponible)
- `usage local [daily|weekly|monthly]` → consumo histórico local con `@ccusage/pi`
- default `/usage` → `limits` usando provider activo o fallback configurable

## Provider adapters (v1)
- openai-codex
- anthropic (oauth)
- openrouter

## UX
- salida textual compacta y legible
- barras visuales por `left %`
- semáforo por umbral (>70 verde, 30-70 amarillo, <30 rojo)
- reset time en timezone local portable + countdown

## Compatibility contract
- Linux/macOS/WSL
- sin hardcode de rutas de Hermes
- setup por variables y/o config del package

## Acceptance criteria
1. `/usage` funciona en Pi sin usar LLM para resolver el comando.
2. Si un provider no está autenticado o no expone cuota: mensaje claro y no crash.
3. Reset time correcto en timezone local/fijada por env.
4. Package instalable con `pi install npm:<package>`.
5. README con matrix de providers y troubleshooting.
