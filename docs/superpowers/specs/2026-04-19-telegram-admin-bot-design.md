# Telegram Admin Bot Design

## Goal

Criar um bot Telegram `admin-only` para gerenciar a operação do Arbor Sync sem depender do PC do usuário, com fonte de verdade no Supabase e suporte a crescimento para jobs administrativos futuros.

## Scope

Esta primeira versão cobre:

- autenticação implícita por allowlist de `ADMIN_TELEGRAM_USER_ID`
- menu principal com navegação por botões
- resumo operacional
- gestão de licenças
- gestão de devices por licença
- gestão de payloads JSON por modo (`gpt`, `perplexity`)
- placeholders navegáveis para scripts futuros
- documentação e configuração para deploy 24h

Esta versão não cobre:

- painel para usuários finais
- cobrança pelo Telegram
- execução real dos scripts futuros
- sincronização com Google Sheets como fonte principal

## Architecture

O bot roda como um processo Node.js independente dentro do repositório e usa long polling da API do Telegram. O Supabase continua como única fonte de verdade para licenças, devices, sessões e payloads; o bot usa a `service role key` para executar operações administrativas diretamente no banco e reutiliza a mesma lógica de criptografia de payload já usada nas Edge Functions.

O bot é dividido em camadas pequenas:

- `runtime`: inicialização, config e loop de polling
- `telegram`: cliente API, roteador, menus e estado de conversa
- `services`: operações de domínio em licenças, devices, payloads, resumo e scripts
- `supabase`: cliente administrativo

## Admin Model

O bot aceita comandos e callbacks apenas do usuário Telegram `8756917796`. Qualquer outro chat recebe resposta genérica de acesso negado e não consegue navegar no painel.

Para reduzir risco operacional:

- toda ação sensível gera registro em `admin_audit_logs`
- uploads de payload são validados antes de gravar
- ações destrutivas passam por confirmação por botão

## Data Model Changes

Além das tabelas existentes (`licenses`, `devices`, `sessions`, `mode_payloads`), o bot adiciona:

### `admin_audit_logs`

Registra todas as ações administrativas relevantes:

- `actor_telegram_user_id`
- `action`
- `target_type`
- `target_id`
- `metadata`
- `created_at`

### `admin_jobs`

Catálogo de automações administrativas futuras:

- `job_key`
- `label`
- `description`
- `schedule_text`
- `enabled`
- `status`
- `last_run_at`
- `last_result`
- `created_at`
- `updated_at`

Inicialmente os jobs são placeholders navegáveis, sem executor real.

## Telegram UX

O menu principal expõe:

- `Resumo`
- `Licenças`
- `Devices`
- `Payloads`
- `Scripts`
- `Config`

### Resumo

Mostra métricas rápidas:

- total de licenças
- licenças ativas, expiradas e revogadas
- devices ativos
- sessões ativas
- payload ativo por modo e versão

### Licenças

Fluxos:

- listar licenças ativas
- buscar licença por chave
- criar nova licença
- alterar plano
- alterar limite de devices
- renovar `current_period_end`
- revogar licença
- reativar licença

### Devices

Fluxos:

- buscar devices por licença
- listar devices ativos
- revogar device
- reativar device

### Payloads

Fluxos:

- ver payload ativo por modo
- subir novo JSON para `gpt` ou `perplexity`
- ativar nova versão
- listar versões recentes
- reativar versão anterior

O fluxo `New JSON` funciona como wizard:

1. usuário escolhe o modo
2. bot entra em estado de espera por documento
3. usuário envia arquivo `.json`
4. bot baixa o arquivo via API do Telegram
5. valida estrutura JSON
6. criptografa payload
7. grava nova versão em `mode_payloads`
8. marca a nova versão como ativa
9. registra auditoria

### Scripts

Menu pronto para crescimento com botões:

- `Revogar JSON semanal`
- `Excluir todos os chats`
- `Novo script`

Nesta versão os jobs podem ser listados, ativados/desativados em nível de catálogo e exibem status `em breve` quando ainda não houver executor real.

### Config

Mostra:

- projeto Supabase configurado
- admin autorizado
- ambiente atual
- healthcheck simples do bot

## Error Handling

- mensagens inválidas fora de um fluxo guiado recebem instrução curta e botão para voltar ao menu
- upload inválido informa o motivo e mantém o usuário no wizard
- falha no Supabase gera mensagem amigável com retry
- falha de polling faz backoff e continua tentando

## Deployment

O bot deve poder rodar 24h fora do PC do usuário. A implementação ficará pronta para:

- long polling em qualquer host Node
- variáveis de ambiente por painel do provedor
- healthcheck simples para observabilidade

Para hospedagem gratuita, a recomendação final será baseada em pesquisa atualizada após a implementação, com foco em opções que suportem processo Node sempre ativo ou quase sempre ativo.

## Testing Strategy

Validação mínima desta entrega:

- script de check de configuração
- smoke test local das rotas lógicas do bot
- validação dos serviços de licença, device e payload contra o schema real
- verificação de parsing do upload JSON

## Files

Arquivos novos principais:

- `telegram-admin-bot/src/index.mjs`
- `telegram-admin-bot/src/config.mjs`
- `telegram-admin-bot/src/telegram/client.mjs`
- `telegram-admin-bot/src/telegram/router.mjs`
- `telegram-admin-bot/src/telegram/menus.mjs`
- `telegram-admin-bot/src/telegram/session-store.mjs`
- `telegram-admin-bot/src/services/*.mjs`
- `telegram-admin-bot/src/lib/*.mjs`
- `telegram-admin-bot/.env.example`
- `scripts/check-telegram-admin-bot.mjs`
- `supabase/migrations/20260419_add_admin_bot_tables.sql`

Arquivos modificados principais:

- `package.json`
- `README` ou documentação do projeto

## Decisions

- Supabase é a fonte de verdade; Google Sheets não entra no caminho crítico
- bot é estritamente `admin-only`
- long polling é preferido ao webhook nesta primeira versão para reduzir complexidade
- scripts futuros ficam modelados desde já, mas sem executor real nesta entrega
