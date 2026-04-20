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

## Resumo Operacional para Agentes
Se o usuário solicitar novas "features", NÃO EMPILHE BOTÕES. Avalie se a função precisa de uma aba própria ou se pode substituir sutilmente algo na tela. Tudo deve ser tratado como a criação de um software premium na casa dos milhares de dólares. Menos fricção, transições impecáveis, cores curadas. Menos é, obrigatoriamente, mais.
