# 🌡️ Termômetro de Conversão ao Vivo

Mede a "temperatura" da plateia durante uma apresentação ao vivo de produto digital (live, webinar, lançamento) e projeta uma faixa de conversão em tempo real a partir dos comentários do chat.

## Como funciona

1. **Classificação dos comentários** — cada mensagem do chat é classificada em uma de 8 categorias de intenção:

   | Categoria | Peso no score |
   |---|---|
   | Compra iminente | +1.0 |
   | Interesse alto | +0.6 |
   | Pergunta técnica | +0.35 |
   | Dúvida neutra | +0.1 |
   | Hype vazio | +0.05 |
   | Ruído | 0.0 |
   | Objeção: confiança | −0.45 |
   | Objeção: preço | −0.5 |

   A classificação pode ser feita por **heurística local** (regex/palavras-chave, funciona offline) ou por **IA** (API da Anthropic).

2. **Projeção de conversão** — o score médio ponderado dos comentários é mapeado para uma taxa de intenção dentro do chat, corrigido pelo viés de amostra (quem comenta é mais engajado que a audiência total) e convertido em estimativa de vendas com margem de incerteza de ±25%, além do faturamento projetado contra a meta.

3. **Sugestões de ajuste de discurso** — conforme a distribuição das categorias, o app sugere ações em tempo real (ex.: muita objeção de preço → ancorar valor, mostrar ROI, reforçar parcelamento e garantia).

## Rodando localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173 no navegador.

## Stack

- [Vite](https://vite.dev/) + [React 19](https://react.dev/) + TypeScript
- Sem dependências de UI — estilos inline/CSS embutido

## ⚠️ Sobre a classificação por IA

A função `classificarIA` chama a API da Anthropic. Para usar fora de um ambiente sandbox, configure a `ANTHROPIC_API_KEY` em um **backend** e faça proxy da chamada — **nunca exponha a key no front-end**. Sem isso, use a classificação por heurística (`classificarHeuristica`), que funciona 100% local.
