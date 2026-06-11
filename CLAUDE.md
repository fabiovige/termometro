# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm run dev      # dev server em http://localhost:5173
npm run build    # tsc -b && vite build (use para validar tipos — não há testes)
npm run lint     # eslint .
```

Não há suíte de testes configurada; `npm run build` é a verificação de tipos.

## Arquitetura

App de página única (Vite + React 19 + TS) com **todo o código em `src/TermometroConversao.tsx`** — tipos, lógica de domínio e UI no mesmo arquivo, por design (foi pensado para ser portável como artefato único). `src/main.tsx` só monta o `<App />`. Estilos são inline/CSS embutido; não adicionar dependências de UI.

O domínio é "termômetro de conversão" para apresentações ao vivo: comentários do chat são classificados em 8 categorias de intenção (`Categoria`) e convertidos em projeção de vendas. O fluxo dentro do arquivo:

1. **Classificação** — duas vias intercambiáveis que retornam `Categoria`:
   - `classificarHeuristica(texto)` — regex/palavras-chave, síncrona, sempre funciona.
   - `classificarIA(textos)` — chama a API da Anthropic (`API_URL` no topo da seção). Em caso de erro, o `App` faz fallback automático para a heurística (`erroIA` sinaliza na UI).
2. **`projetar(comentarios, audiencia, meta, ticket)`** — pura. Score médio ponderado por `PESOS` → normalizado para taxa de intenção no chat (teto de 45%) → corrigido por `FATOR_AMOSTRA` (0.35, viés de quem comenta) → vendas estimadas com `MARGEM` de ±25%. Essas constantes são as alavancas de calibração do modelo.
3. **`sugerir(dist, proj, meta)`** — pura; regras de limiar sobre a distribuição de categorias geram sugestões de ajuste de discurso com urgência.

As quatro funções acima são exportadas individualmente (além do `App` default) justamente para permitir teste/uso isolado.

## Restrições

- `classificarIA` hoje aponta direto para `api.anthropic.com` — em produção isso deve virar um proxy de backend (a key nunca vai no front). O comentário em `API_URL` marca o ponto de troca.
- O texto da UI e os identificadores de domínio são em português; manter o padrão.
