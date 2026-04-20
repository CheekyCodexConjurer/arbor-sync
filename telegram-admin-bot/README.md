# Telegram Admin Bot

Bot administrativo do Arbor Sync para gerenciar licencas, devices, payloads JSON e placeholders de scripts futuros via Telegram.

## Setup local

1. Preencha `telegram-admin-bot/.env` a partir de `telegram-admin-bot/.env.example`
2. Aplique a migration `supabase/migrations/20260419_add_admin_bot_tables.sql`
3. Rode `npm run telegram:check`
4. Rode `npm run telegram:bot`
5. No Telegram, envie `/start` para o bot

## Variaveis de ambiente

- `TELEGRAM_BOT_TOKEN`
- `ADMIN_TELEGRAM_USER_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYLOAD_ENCRYPTION_SECRET`
- `BOT_NAME`
- `POLLING_TIMEOUT_SEC`
- `RETRY_DELAY_MS`

## Menus entregues

- Resumo
- Licencas
- Devices
- Payloads
- Scripts
- Config

## Upload de JSON

O fluxo `New JSON` aceita:

- array de cookies
- objeto com `cookies`, `proxy` e `targetUrl`

Quando o arquivo chega:

1. o bot baixa o documento no Telegram
2. valida o JSON
3. criptografa usando `PAYLOAD_ENCRYPTION_SECRET`
4. cria nova versao em `mode_payloads`
5. registra auditoria em `admin_audit_logs`

## Hosting 24h

O caminho gratuito mais viavel neste projeto e:

- `Render Free` para rodar o bot
- `UptimeRobot Free` chamando `/health` a cada 5 minutos

### Por que

- `Render Free` aceita Web Service Node sem cartao
- o bot usa long polling e precisa de um processo vivo
- `Render` free entra em sleep se nao houver trafego de entrada
- o endpoint `/health` existe justamente para o monitor manter o servico acordado

### Deploy

1. subir este repositorio para GitHub
2. criar um Web Service no Render apontando para o repo
3. usar `npm install` como build command
4. usar `npm run telegram:bot` como start command
5. definir `health check path` como `/health`
6. cadastrar no painel as variaveis do `telegram-admin-bot/.env.example`
7. criar um monitor no UptimeRobot para pingar o `/health`
