# Arbor Sync - Design System & UI/UX Guidelines

Este documento define as diretrizes estéticas e arquiteturais da interface da extensão Arbor Sync. **Todas as futuras atualizações e IAs atuando neste projeto devem aderir estritamente a estas regras** para manter a sensação de uma plataforma premium, cara e utilitária.

## 1. Filosofia de Design (Minimalismo Premium)
- **Foco Absoluto na Facilidade:** A extensão é feita para que "qualquer pessoa consiga usar". Zero complexidade de navegação. 
- **Redução Cognitiva:** Mínimo de botões possível e poucas descrições (textos longos ou explicativos demais na UI são proibidos). As ações devem ser deduzidas intuitivamente.
- **Estética Natural/Verde:** O tema principal é "Natureza, Calma, Sincronicidade e Alta Engenharia". Utilizamos tons orgânicos (verdes floresta, sálvia, off-white) para transmitir segurança e um produto hiper polido, fugindo completamente de cores agressivas.

## 2. Paleta de Cores e Tipografia (Tokens CSS)
- **Backgrounds:** `--bg-base: #F0F4F1` (Off-white levemente esverdeado, não agride os olhos).
- **Cards e Glassmorphism:** O contêiner principal `#appShell` usa `--panel-bg: rgba(255, 255, 255, 0.85)` combinado com o desfoque `--glass-blur: 16px`. Elementos devem flutuar com suavidade sobre os bulbos coloridos de fundo.
- **Texto:** Família tipográfica **Outfit** (elegante e geométrica). `--text-main: #2A3B31` para alta legibilidade e `--text-muted: #6B8073` para descrições sutis.
- **Acentos (Verde Premium):** O coração da extensão é o verde `--accent: #4A7C59` e o letreiro utiliza `--gradient-brand: linear-gradient(135deg, #4A7C59 0%, #7AA884 100%)`.

## 3. Arquitetura de Componentes UI (Técnico)
- **Botões Dinâmicos (`.primary-btn` / `.secondary-btn`):**
  - **Border Radius:** Sempre generoso (`14px` ou `10px`), criando formas modernas (*squircle*).
  - **Hover Effects/Animações:** Nunca alterar propriedades pesadas, utilizar transições apenas de cor e luz (`transition: background 0.2s ease, box-shadow 0.2s ease`) e emissão de brilho sutil ao flutuar o mouse (`box-shadow: 0 8px 20px rgba(74, 124, 89, 0.3)`).
  - **Iconografia:** Textos em botões devem ser curtos (ex: "Abrir") e acompanhados de ícones SVG limpos de tamanho e peso compatíveis (`stroke-width="2"`).
  
- **Inputs de Texto (`.text-input`):**
  - Fundo translúcido `rgba(255, 255, 255, 0.92)` com bordas delicadas `rgba(0, 0, 0, 0.12)`.
  - **Micro-interação:** Ao receber foco (`:focus`), a borda transita para o verde da marca e projeta um anel de sombra hiper sutil (`box-shadow: 0 0 0 4px rgba(74, 124, 89, 0.12)`), dando feedback visual imediato.

- **Separação de Estados (Views) - A Regra de Ouro:**
  - **Nunca misturar fluxos na mesma tela.** 
  - Utilize blocos como `#authView` e `#mainView` separados. Alterne a visibilidade deles via Javascript utilizando a classe `.hidden`. A interface visível em qualquer momento deve conter o mínimo possível de elementos em sua estrutura.
  - O rodapé da estrutura (`.card-footer`) é sagrado: deve sempre abrigar a linha indicadora de status e a versão num contêiner separado por uma borda limpa e hiper-fina (`border-top: 1px solid rgba(0, 0, 0, 0.05)`).

## 4. Animações e Micro-Interações (Obrigatório)
- **Fluidez em Tudo:** Nunca altere o estado da interface instantaneamente sem um *feedback* visual. Todas as trocas de contexto devem parecer mágicas.
- **Transições:** Todos os botões, links e *inputs* devem ter `transition: all 0.2s ease` ou similar.
- **Animações de Sucesso/Processamento:** Utilize SVGs animados (como `stroke-dasharray` e `stroke-dashoffset`) para exibir checkmarks de validação (`successView`). 
- **Estados de Carregamento:** Bloqueie interações (`disabled`) de forma natural e exiba feedback na interface (ex: *Fade-in* em elementos que entram em tela). A ausência de resposta imediata na UI é intolerável numa plataforma cara.

## 5. Alertas e Avisos de Sistema
- **Proibido usar Vermelho Vivo:** Mesmo que a extensão apresente erros ou falhas de versão, nunca assuste o usuário. Utilizar tons terrosos (âmbar/marrom/argila como `--danger: #B5835A`) ou verde escuro.
- Transformar notificações de problemas (como "Update Disponível" ou "Navegador Desatualizado") em ações elegantes, guiando o usuário à solução sem quebrar o sentimento de calmaria da extensão.

## 6. Arquitetura Anti-Godfile
- **Alvo de tamanho:** arquivos de código devem mirar `300 linhas`.
- **Tolerância de coesão:** até `~360 linhas` pode ser aceitável quando o arquivo ainda tiver uma única responsabilidade clara.
- **Acima disso:** toda mudança deve vir acompanhada de extração de responsabilidade, salvo justificativa explícita e temporária.
- **Escopo da regra:** vale para arquivos de implementação, fluxo e lógica de UI em `src/` e `scripts/`.
- **Exceções:** arquivos gerados, snapshots, assets, vendor, manifestos curtos e casos em que dividir realmente piora a legibilidade.
- **Regra operacional:** se tocou em arquivo grande, precisa reduzir ou ao menos isolar uma responsabilidade naquela mesma mudança.
- **Regra arquitetural:** nenhum arquivo deve concentrar ao mesmo tempo renderização, estado, side effects e integração externa quando isso puder ser separado.
- **Espírito da regra:** evitar godfiles, preferir extração por responsabilidade real e dividir antes de adicionar nova feature quando o arquivo já estiver saturado.

## 7. Governança de Versão, Git, Commits e Worktree
- **Status antes de agir:** antes de qualquer alteração, execute ou inspecione `git status --short` e separe mentalmente o que já estava sujo do que será criado pela tarefa atual. Nunca reverta mudanças do usuário sem pedido explícito.
- **Versionamento obrigatório:** qualquer mudança de comportamento, UI, runtime, contrato de API, fluxo de autenticação, bloqueio, payload, bot ou infraestrutura deve atualizar a versão no mesmo pacote de alteração. Correções compatíveis incrementam patch, novas capacidades incrementam minor, quebras de compatibilidade incrementam major.
- **Fontes de versão sincronizadas:** `manifest.json`, `package.json`, `package-lock.json` e qualquer script que envie `clientVersion` precisam apontar para a mesma versão. É proibido deixar versão hardcoded quando ela puder ser lida do manifesto.
- **Falha automática:** `npm run check` deve falhar quando houver divergência de versão, arquivo de guard/teste ausente, arquivo sensível local versionado ou regressão coberta por teste. Não declare tarefa concluída sem rodar o check aplicável.
- **Commits profissionais:** commits devem ser pequenos, coesos e nomeados com Conventional Commits (`fix:`, `feat:`, `chore:`, `test:`, `refactor:`). O bump de versão deve estar no mesmo commit da mudança funcional que exige esse bump.
- **Staging seguro:** nunca use `git add .` às cegas em worktree sujo. Stage apenas arquivos do escopo confirmado, preserve mudanças alheias e reporte qualquer arquivo modificado/untracked que impeça um commit limpo.
- **Worktree limpo é contrato:** ao finalizar, informe o resultado de `git status --short`. Só diga que está limpo se o comando confirmar. Se restarem arquivos fora do escopo, deixe isso explícito.
- **`.gitignore` evolui junto:** ao criar logs, builds, perfis de navegador, dumps, payloads locais, chaves, `.env`, artefatos Supabase ou arquivos temporários, atualize o `.gitignore` na mesma mudança. Segredos, tokens, payloads locais e chaves de extensão nunca entram em commit.
- **Verificação antes de entrega:** rode testes direcionados para a área tocada e depois `npm run check` quando viável. Se algum teste não puder rodar, explique o bloqueio de forma objetiva.

## 8. Infraestrutura e Supabase Free
- **Supabase Free obrigatório:** toda decisão de infraestrutura deve caber no plano Supabase Free. É proibido depender de recurso pago, add-on pago, compute pago, autoscaling pago, banco dedicado pago ou qualquer serviço externo com custo recorrente sem aprovação explícita do usuário.
- **Superfícies permitidas:** use apenas recursos compatíveis com zero custo no projeto atual, como Postgres, Edge Functions, Auth/Storage quando cabível e limites gratuitos documentados. Se uma solução ameaçar quota, custo ou upgrade, pare e proponha alternativa local, incremental ou manual.
- **Custo antes de arquitetura:** antes de adicionar jobs, filas, storage pesado, sync automático, cron, analytics, logs persistentes ou processamento recorrente, estime impacto no Free tier e prefira execução sob demanda, scripts locais e tabelas simples.
- **Falha segura:** migrations e funções devem degradar com mensagens claras sem criar dependências pagas. Nunca resolver limitação do Free tier empurrando upgrade de plano como requisito silencioso.

## Resumo Operacional para Agentes
Se o usuário solicitar novas "features", NÃO EMPILHE BOTÕES. Avalie se a função precisa de uma aba própria ou se pode substituir sutilmente algo na tela. Tudo deve ser tratado como a criação de um software premium na casa dos milhares de dólares. Menos fricção, transições impecáveis, cores curadas. Menos é, obrigatoriamente, mais.
