import React, { useState, useRef, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
// Termômetro de Conversão ao Vivo — TypeScript
// Mede a "temperatura" da plateia durante uma apresentação de
// produto digital e projeta uma faixa de conversão em tempo real.
//
// Para usar fora do Claude.ai: defina ANTHROPIC_API_KEY no seu
// backend e faça proxy da chamada (nunca exponha a key no front).
// ─────────────────────────────────────────────────────────────

// ── Tipos ──
type Categoria =
  | "compra_iminente"
  | "interesse_alto"
  | "pergunta_tecnica"
  | "duvida_neutra"
  | "objecao_preco"
  | "objecao_confianca"
  | "hype_vazio"
  | "ruido";

interface Comentario {
  id: number;
  txt: string;
  cat: Categoria;
}

interface Projecao {
  taxa: number; // % estimada sobre a audiência total
  taxaChat: number; // % de sinal de intenção dentro do chat
  vendasEst: number;
  vendasBaixo: number;
  vendasAlto: number;
  faturamento: number;
  score: number; // score médio ponderado (-0.5 .. 1.0)
  batendoMeta: boolean;
}

type Urgencia = "alta" | "media" | "boa";

interface Sugestao {
  urg: Urgencia;
  txt: string;
}

interface Rotulo {
  txt: string;
  cor: string;
}

// ── Pesos por sinal de intenção ──
const PESOS: Record<Categoria, number> = {
  compra_iminente: 1.0,
  interesse_alto: 0.6,
  pergunta_tecnica: 0.35,
  duvida_neutra: 0.1,
  objecao_preco: -0.5,
  objecao_confianca: -0.45,
  hype_vazio: 0.05,
  ruido: 0.0,
};

const ROTULOS: Record<Categoria, Rotulo> = {
  compra_iminente: { txt: "Compra iminente", cor: "#39FF7A" },
  interesse_alto: { txt: "Interesse alto", cor: "#8BE36B" },
  pergunta_tecnica: { txt: "Pergunta técnica", cor: "#E6D74B" },
  duvida_neutra: { txt: "Dúvida neutra", cor: "#C9C9C9" },
  objecao_preco: { txt: "Objeção: preço", cor: "#FF8A3D" },
  objecao_confianca: { txt: "Objeção: confiança", cor: "#FF5A4D" },
  hype_vazio: { txt: "Hype vazio", cor: "#7FB0D8" },
  ruido: { txt: "Ruído", cor: "#6B6B6B" },
};

const CATEGORIAS = Object.keys(ROTULOS) as Categoria[];

function isCategoria(v: string): v is Categoria {
  return (CATEGORIAS as string[]).includes(v);
}

// ── Classificador heurístico (offline / fallback) ──
export function classificarHeuristica(texto: string): Categoria {
  const t = texto.toLowerCase();
  const tem = (...arr: string[]): boolean => arr.some((p) => t.includes(p));

  if (
    tem(
      "comprei",
      "comprando",
      "acabei de comprar",
      "tô dentro",
      "to dentro",
      "fechei",
      "paguei",
      "cadê o link",
      "cade o link",
      "quero o link",
      "manda o link"
    )
  )
    return "compra_iminente";
  if (
    tem(
      "muito caro",
      "caríssimo",
      "carissimo",
      "salgado",
      "fora do orçamento",
      "fora do orcamento",
      "não tenho esse dinheiro",
      "nao tenho esse dinheiro",
      "tá caro",
      "ta caro",
      "preço alto",
      "preco alto"
    )
  )
    return "objecao_preco";
  if (
    tem(
      "golpe",
      "é furada",
      "e furada",
      "funciona mesmo",
      "será que",
      "sera que",
      "tenho receio",
      "desconfio",
      "garantia?",
      "reembolso"
    )
  )
    return "objecao_confianca";
  if (
    tem(
      "quero muito",
      "preciso disso",
      "vou comprar",
      "tô pensando em comprar",
      "vale a pena",
      "to querendo",
      "tô querendo"
    )
  )
    return "interesse_alto";
  if (
    tem(
      "como funciona",
      "tem suporte",
      "parcela",
      "quantas vezes",
      "boleto",
      "pix",
      "quanto tempo",
      "acesso vitalício",
      "acesso vitalicio",
      "tem certificado",
      "como faço",
      "como faco"
    )
  )
    return "pergunta_tecnica";
  if (tem("?")) return "duvida_neutra";
  if (tem("top", "show", "boa", "🔥", "👏", "❤", "massa", "incrível", "incrivel", "lindo"))
    return "hype_vazio";
  return "ruido";
}

// ── Classificador via API Claude (IA real) ──
// ATENÇÃO: fora do Claude.ai você precisa de um backend/proxy com
// sua ANTHROPIC_API_KEY. Ajuste a URL abaixo para o seu endpoint.
interface AnthropicTextBlock {
  type: "text";
  text: string;
}
interface AnthropicResponse {
  content: Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
}

const API_URL = "https://api.anthropic.com/v1/messages"; // troque por seu proxy em produção

export async function classificarIA(textos: string[]): Promise<Categoria[]> {
  const prompt = `Você é um analista de conversão de vendas. Classifique cada comentário de um chat ao vivo durante uma apresentação de produto digital.

Categorias possíveis (use exatamente estes nomes):
- compra_iminente: pessoa diz que comprou, está comprando ou pede o link de compra
- interesse_alto: demonstra forte desejo de comprar, "quero", "vale a pena"
- pergunta_tecnica: dúvida séria sobre o produto (suporte, acesso, parcelamento, conteúdo)
- duvida_neutra: pergunta morna ou pedido de informação genérica
- objecao_preco: reclama do preço, acha caro, não tem dinheiro
- objecao_confianca: desconfia, pergunta se é golpe, se funciona
- hype_vazio: elogio raso, emoji, "top", "show"
- ruido: off-topic, spam, sem relação

Comentários:
${textos.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Responda APENAS com um array JSON de strings, uma categoria por comentário, na ordem. Sem markdown, sem texto extra. Exemplo: ["objecao_preco","interesse_alto"]`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`API ${response.status}`);

  const data = (await response.json()) as AnthropicResponse;
  const txt = data.content
    .filter((b): b is AnthropicTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  const arr = JSON.parse(txt) as unknown;
  if (!Array.isArray(arr)) throw new Error("Resposta da IA não é um array");
  return arr.map((c) => (typeof c === "string" && isCategoria(c) ? c : "ruido"));
}

// ── Projeção de conversão ──
export function projetar(
  comentarios: Comentario[],
  audiencia: number,
  meta: number,
  ticket: number
): Projecao {
  if (comentarios.length === 0) {
    return {
      taxa: 0,
      taxaChat: 0,
      vendasEst: 0,
      vendasBaixo: 0,
      vendasAlto: 0,
      faturamento: 0,
      score: 0,
      batendoMeta: false,
    };
  }

  const soma = comentarios.reduce((acc, c) => acc + PESOS[c.cat], 0);
  const scoreMedio = soma / comentarios.length; // -0.5 .. 1.0

  // mapeia score [-0.5, 1.0] para taxa de intenção no chat [0%, 45%]
  const norm = Math.max(0, Math.min(1, (scoreMedio + 0.5) / 1.5));
  const taxaChat = norm * 0.45;

  // chat é amostra enviesada pra cima (~5-15% da audiência, mais engajada)
  const FATOR_AMOSTRA = 0.35;
  const taxa = taxaChat * FATOR_AMOSTRA;

  const vendasEst = audiencia * taxa;
  const MARGEM = 0.25; // ±25% de incerteza
  const vendasBaixo = Math.max(0, Math.round(vendasEst * (1 - MARGEM)));
  const vendasAlto = Math.round(vendasEst * (1 + MARGEM));
  const faturamento = Math.round(vendasEst) * ticket;

  return {
    taxa: taxa * 100,
    taxaChat: taxaChat * 100,
    vendasEst: Math.round(vendasEst),
    vendasBaixo,
    vendasAlto,
    faturamento,
    score: scoreMedio,
    batendoMeta: vendasEst >= meta,
  };
}

// ── Sugestões de ajuste de discurso ──
export function sugerir(
  dist: Partial<Record<Categoria, number>>,
  proj: Projecao,
  meta: number
): Sugestao[] {
  const s: Sugestao[] = [];
  const total = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const pct = (k: Categoria): number => ((dist[k] ?? 0) / total) * 100;

  if (pct("objecao_preco") > 25)
    s.push({
      urg: "alta",
      txt: "Preço está travando. Ancore o valor: mostre ROI, divida em 'menos de R$X/dia', reforce parcelamento e garantia.",
    });
  if (pct("objecao_confianca") > 15)
    s.push({
      urg: "alta",
      txt: "Há desconfiança no chat. Traga prova social ao vivo: depoimentos, prints de resultado, sua garantia incondicional.",
    });
  if (pct("compra_iminente") + pct("interesse_alto") > 35)
    s.push({
      urg: "boa",
      txt: "Plateia quente! Abra o carrinho agora e crie urgência (vagas/bônus por tempo limitado). Não esfrie o momento.",
    });
  if (pct("pergunta_tecnica") > 30)
    s.push({
      urg: "media",
      txt: "Muita dúvida técnica = interesse real travado por falta de clareza. Pare e responda as 3 perguntas mais repetidas.",
    });
  if (pct("hype_vazio") + pct("ruido") > 50)
    s.push({
      urg: "media",
      txt: "Engajamento raso. Faça uma pergunta direta de qualificação ('quem aqui já passou por X?') pra puxar intenção real.",
    });
  if (!proj.batendoMeta && proj.vendasEst > 0)
    s.push({
      urg: "alta",
      txt: `Projeção (${proj.vendasEst}) abaixo da meta (${meta}). Reforce a oferta e o CTA, ou adicione um bônus de fechamento.`,
    });
  if (proj.batendoMeta)
    s.push({
      urg: "boa",
      txt: "No ritmo certo pra bater a meta. Mantenha a pegada e feche com chamada clara pra ação.",
    });
  if (s.length === 0)
    s.push({
      urg: "media",
      txt: "Ainda há poucos sinais. Continue alimentando o chat pra leitura ganhar precisão.",
    });
  return s;
}

const EXEMPLOS: string[] = [
  "acabei de comprar, tô dentro!!",
  "6 mil tá muito caro pra mim 😢",
  "tem parcelamento? em quantas vezes?",
  "será que funciona mesmo ou é furada?",
  "quero muito esse curso, vale a pena demais",
  "cadê o link de compra?",
  "top demais 🔥🔥",
  "tem suporte depois da compra?",
  "fora do meu orçamento agora infelizmente",
  "isso é golpe? tenho receio",
];

// ── Componente principal ──
export default function App(): React.ReactElement {
  const [audiencia, setAudiencia] = useState<number>(2000);
  const [meta, setMeta] = useState<number>(200);
  const [ticket, setTicket] = useState<number>(6000);
  const [usarIA, setUsarIA] = useState<boolean>(true);
  const [entrada, setEntrada] = useState<string>("");
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [erroIA, setErroIA] = useState<boolean>(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const proj = useMemo<Projecao>(
    () => projetar(comentarios, audiencia, meta, ticket),
    [comentarios, audiencia, meta, ticket]
  );

  const dist = useMemo<Partial<Record<Categoria, number>>>(() => {
    const d: Partial<Record<Categoria, number>> = {};
    comentarios.forEach((c) => {
      d[c.cat] = (d[c.cat] ?? 0) + 1;
    });
    return d;
  }, [comentarios]);

  const sugestoes = useMemo<Sugestao[]>(() => sugerir(dist, proj, meta), [dist, proj, meta]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [comentarios]);

  async function adicionar(): Promise<void> {
    const linhas = entrada
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length === 0) return;
    setEntrada("");

    if (usarIA) {
      setCarregando(true);
      setErroIA(false);
      try {
        const cats = await classificarIA(linhas);
        setComentarios((prev) => [
          ...prev,
          ...linhas.map<Comentario>((t, i) => ({
            id: Date.now() + i,
            txt: t,
            cat: cats[i] ?? "ruido",
          })),
        ]);
      } catch {
        setErroIA(true);
        setComentarios((prev) => [
          ...prev,
          ...linhas.map<Comentario>((t, i) => ({
            id: Date.now() + i,
            txt: t,
            cat: classificarHeuristica(t),
          })),
        ]);
      } finally {
        setCarregando(false);
      }
    } else {
      setComentarios((prev) => [
        ...prev,
        ...linhas.map<Comentario>((t, i) => ({
          id: Date.now() + i,
          txt: t,
          cat: classificarHeuristica(t),
        })),
      ]);
    }
  }

  function carregarExemplo(): void {
    setEntrada(EXEMPLOS.join("\n"));
  }

  function limpar(): void {
    setComentarios([]);
    setErroIA(false);
  }

  // temperatura 0-100 a partir do score (-0.5..1.0)
  const temp = Math.round(Math.max(0, Math.min(100, ((proj.score + 0.5) / 1.5) * 100)));
  const tempCor =
    temp >= 66 ? "#39FF7A" : temp >= 40 ? "#E6D74B" : temp >= 20 ? "#FF8A3D" : "#FF5A4D";
  const tempTxt =
    temp >= 66 ? "QUENTE" : temp >= 40 ? "MORNO" : temp >= 20 ? "ESFRIANDO" : "FRIO";

  return (
    <div style={st.wrap}>
      <style>{css}</style>

      <header style={st.header}>
        <div style={st.brandRow}>
          <div style={st.dot} />
          <div>
            <h1 style={st.h1}>TERMÔMETRO DE CONVERSÃO</h1>
            <p style={st.sub}>leitura ao vivo da plateia · projeção de vendas em tempo real</p>
          </div>
        </div>
        <div style={st.modo}>
          <button className={"seg " + (usarIA ? "on" : "")} onClick={() => setUsarIA(true)}>
            IA (Claude)
          </button>
          <button className={"seg " + (!usarIA ? "on" : "")} onClick={() => setUsarIA(false)}>
            Heurística
          </button>
        </div>
      </header>

      {erroIA && (
        <div style={st.aviso}>
          API indisponível agora — usando classificação heurística como fallback.
        </div>
      )}

      <div style={st.grid} className="grid-main">
        {/* ── COLUNA ESQUERDA: medidor ── */}
        <section style={st.painel}>
          <div style={st.vuTop}>
            <span style={st.vuLabel}>TEMPERATURA DA PLATEIA</span>
            <span style={{ ...st.vuStatus, color: tempCor }}>{tempTxt}</span>
          </div>

          <div style={st.gaugeWrap}>
            <div style={st.gaugeTrack}>
              <div
                style={{
                  ...st.gaugeFill,
                  width: `${temp}%`,
                  background: tempCor,
                  boxShadow: `0 0 18px ${tempCor}88`,
                }}
              />
            </div>
            <div style={st.gaugeNum}>
              <span style={{ color: tempCor }}>{temp}</span>
              <span style={st.gaugeUnit}>/100</span>
            </div>
          </div>

          <div style={st.bigGrid}>
            <Metric
              k="PROJEÇÃO DE VENDAS"
              v={comentarios.length ? `${proj.vendasBaixo}–${proj.vendasAlto}` : "—"}
              sub={comentarios.length ? `central: ${proj.vendasEst}` : "sem dados"}
              cor={proj.batendoMeta ? "#39FF7A" : "#FF8A3D"}
            />
            <Metric
              k="META"
              v={String(meta)}
              sub={
                comentarios.length
                  ? proj.batendoMeta
                    ? "✓ no caminho"
                    : `faltam ~${Math.max(0, meta - proj.vendasEst)}`
                  : "—"
              }
              cor={proj.batendoMeta ? "#39FF7A" : "#FF5A4D"}
            />
            <Metric
              k="TAXA EST. (público)"
              v={comentarios.length ? `${proj.taxa.toFixed(1)}%` : "—"}
              sub={comentarios.length ? `chat: ${proj.taxaChat.toFixed(0)}%` : ""}
              cor="#7FB0D8"
            />
            <Metric
              k="FATURAMENTO PROJ."
              v={comentarios.length ? "R$ " + proj.faturamento.toLocaleString("pt-BR") : "—"}
              sub={`ticket R$ ${ticket.toLocaleString("pt-BR")}`}
              cor="#E6D74B"
            />
          </div>

          {/* distribuição */}
          <div style={st.distBox}>
            <span style={st.distTitle}>SINAIS DO CHAT ({comentarios.length})</span>
            {CATEGORIAS.map((k) => {
              const n = dist[k] ?? 0;
              const total = comentarios.length || 1;
              const w = (n / total) * 100;
              if (n === 0) return null;
              return (
                <div key={k} style={st.distRow}>
                  <span style={{ ...st.distLab, color: ROTULOS[k].cor }}>{ROTULOS[k].txt}</span>
                  <div style={st.distTrack}>
                    <div
                      style={{ ...st.distFill, width: `${w}%`, background: ROTULOS[k].cor }}
                    />
                  </div>
                  <span style={st.distN}>{n}</span>
                </div>
              );
            })}
            {comentarios.length === 0 && (
              <p style={st.vazio}>Cole comentários do chat para começar a medir.</p>
            )}
          </div>
        </section>

        {/* ── COLUNA DIREITA: entrada + sugestões + log ── */}
        <section style={st.lado}>
          <div style={st.cfgRow}>
            <Field label="Audiência" v={audiencia} set={setAudiencia} />
            <Field label="Meta vendas" v={meta} set={setMeta} />
            <Field label="Ticket R$" v={ticket} set={setTicket} step={100} />
          </div>

          <textarea
            style={st.ta}
            placeholder="Cole os comentários do chat aqui — um por linha…"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
          />
          <div style={st.btnRow}>
            <button className="btn primary" onClick={adicionar} disabled={carregando}>
              {carregando ? "Analisando…" : "Medir agora"}
            </button>
            <button className="btn ghost" onClick={carregarExemplo}>
              Exemplo
            </button>
            <button className="btn ghost" onClick={limpar}>
              Limpar
            </button>
          </div>

          <div style={st.sugBox}>
            <span style={st.sugTitle}>O QUE AJUSTAR NO DISCURSO</span>
            {sugestoes.map((s, i) => (
              <div key={i} style={{ ...st.sug, borderColor: urgCor(s.urg) }}>
                <span style={{ ...st.sugTag, background: urgCor(s.urg) }}>
                  {s.urg.toUpperCase()}
                </span>
                <span style={st.sugTxt}>{s.txt}</span>
              </div>
            ))}
          </div>

          <div style={st.logBox} ref={logRef}>
            {comentarios.slice(-40).map((c) => (
              <div key={c.id} style={st.logRow}>
                <span
                  style={{
                    ...st.logTag,
                    color: ROTULOS[c.cat].cor,
                    borderColor: ROTULOS[c.cat].cor,
                  }}
                >
                  {ROTULOS[c.cat].txt}
                </span>
                <span style={st.logTxt}>{c.txt}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer style={st.foot}>
        Estimativa baseada em amostra do chat (enviesada pra cima) com desconto pra audiência
        total. É um indicador de tendência ao vivo, não uma previsão contábil.
      </footer>
    </div>
  );
}

// ── Subcomponentes ──
interface MetricProps {
  k: string;
  v: string;
  sub: string;
  cor: string;
}

function Metric({ k, v, sub, cor }: MetricProps): React.ReactElement {
  return (
    <div style={st.metric}>
      <span style={st.metricK}>{k}</span>
      <span style={{ ...st.metricV, color: cor }}>{v}</span>
      <span style={st.metricSub}>{sub}</span>
    </div>
  );
}

interface FieldProps {
  label: string;
  v: number;
  set: (n: number) => void;
  step?: number;
}

function Field({ label, v, set, step = 1 }: FieldProps): React.ReactElement {
  return (
    <label style={st.field}>
      <span style={st.fieldL}>{label}</span>
      <input
        type="number"
        value={v}
        step={step}
        onChange={(e) => set(Number(e.target.value) || 0)}
        style={st.input}
      />
    </label>
  );
}

function urgCor(u: Urgencia): string {
  return u === "alta" ? "#FF5A4D" : u === "boa" ? "#39FF7A" : "#E6D74B";
}

// ── Estilos ──
const st: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    background: "#0B0E0D",
    color: "#E8EDE9",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "20px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "18px",
  },
  brandRow: { display: "flex", alignItems: "center", gap: "12px" },
  dot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "#39FF7A",
    boxShadow: "0 0 12px #39FF7A",
    animation: "pulse 1.6s infinite",
  },
  h1: {
    margin: 0,
    fontSize: "20px",
    letterSpacing: "0.12em",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
  },
  sub: { margin: "2px 0 0", fontSize: "12px", color: "#7C857F", letterSpacing: "0.04em" },
  modo: {
    display: "flex",
    gap: "4px",
    background: "#131816",
    padding: "4px",
    borderRadius: "10px",
    border: "1px solid #1F2622",
  },
  aviso: {
    background: "#2A1A12",
    border: "1px solid #FF8A3D55",
    color: "#FFB37A",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "14px",
  },
  grid: { display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: "18px" },
  painel: {
    background: "linear-gradient(180deg,#111614,#0D110F)",
    border: "1px solid #1E2622",
    borderRadius: "16px",
    padding: "20px",
  },
  vuTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: "10px",
  },
  vuLabel: { fontSize: "11px", letterSpacing: "0.18em", color: "#7C857F", fontWeight: 700 },
  vuStatus: {
    fontSize: "16px",
    fontWeight: 800,
    letterSpacing: "0.14em",
    fontFamily: "'Space Grotesk', sans-serif",
  },
  gaugeWrap: { display: "flex", alignItems: "center", gap: "16px", marginBottom: "22px" },
  gaugeTrack: {
    flex: 1,
    height: "22px",
    background: "#0A0D0B",
    borderRadius: "12px",
    border: "1px solid #1E2622",
    overflow: "hidden",
    position: "relative",
  },
  gaugeFill: {
    height: "100%",
    borderRadius: "12px",
    transition: "width .5s cubic-bezier(.4,1.4,.5,1), background .4s",
  },
  gaugeNum: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 800,
    fontSize: "30px",
    minWidth: "92px",
    textAlign: "right",
  },
  gaugeUnit: { fontSize: "14px", color: "#5E665F", fontWeight: 600 },
  bigGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "18px",
  },
  metric: {
    background: "#0C100E",
    border: "1px solid #1A211D",
    borderRadius: "12px",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  metricK: { fontSize: "10px", letterSpacing: "0.1em", color: "#6E776F", fontWeight: 700 },
  metricV: {
    fontSize: "26px",
    fontWeight: 800,
    fontFamily: "'Space Grotesk', sans-serif",
    lineHeight: 1.1,
  },
  metricSub: { fontSize: "11px", color: "#7C857F" },
  distBox: {
    background: "#0C100E",
    border: "1px solid #1A211D",
    borderRadius: "12px",
    padding: "14px",
  },
  distTitle: {
    fontSize: "11px",
    letterSpacing: "0.12em",
    color: "#6E776F",
    fontWeight: 700,
    display: "block",
    marginBottom: "10px",
  },
  distRow: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "7px" },
  distLab: { fontSize: "12px", width: "120px", fontWeight: 600 },
  distTrack: {
    flex: 1,
    height: "8px",
    background: "#0A0D0B",
    borderRadius: "4px",
    overflow: "hidden",
  },
  distFill: { height: "100%", borderRadius: "4px", transition: "width .4s" },
  distN: {
    fontSize: "12px",
    color: "#9AA39C",
    width: "22px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  vazio: { fontSize: "13px", color: "#5E665F", margin: "6px 0 0" },
  lado: { display: "flex", flexDirection: "column", gap: "12px" },
  cfgRow: { display: "flex", gap: "10px" },
  field: { flex: 1, display: "flex", flexDirection: "column", gap: "4px" },
  fieldL: { fontSize: "11px", color: "#7C857F", letterSpacing: "0.04em", fontWeight: 600 },
  input: {
    background: "#0C100E",
    border: "1px solid #1E2622",
    borderRadius: "8px",
    color: "#E8EDE9",
    padding: "8px 10px",
    fontSize: "14px",
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    width: "100%",
    boxSizing: "border-box",
  },
  ta: {
    background: "#0C100E",
    border: "1px solid #1E2622",
    borderRadius: "12px",
    color: "#E8EDE9",
    padding: "12px",
    fontSize: "13px",
    minHeight: "92px",
    resize: "vertical",
    fontFamily: "'Inter', sans-serif",
    lineHeight: 1.5,
  },
  btnRow: { display: "flex", gap: "8px" },
  sugBox: {
    background: "#0C100E",
    border: "1px solid #1A211D",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  sugTitle: { fontSize: "11px", letterSpacing: "0.12em", color: "#6E776F", fontWeight: 700 },
  sug: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    borderLeft: "3px solid",
    paddingLeft: "10px",
    paddingTop: "2px",
    paddingBottom: "2px",
  },
  sugTag: {
    fontSize: "9px",
    fontWeight: 800,
    color: "#0B0E0D",
    padding: "2px 6px",
    borderRadius: "4px",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
    marginTop: "1px",
  },
  sugTxt: { fontSize: "13px", color: "#CDD4CE", lineHeight: 1.45 },
  logBox: {
    background: "#0A0D0B",
    border: "1px solid #1A211D",
    borderRadius: "12px",
    padding: "10px",
    maxHeight: "200px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  logRow: { display: "flex", gap: "8px", alignItems: "flex-start" },
  logTag: {
    fontSize: "9px",
    fontWeight: 700,
    border: "1px solid",
    borderRadius: "4px",
    padding: "1px 5px",
    whiteSpace: "nowrap",
    letterSpacing: "0.03em",
    marginTop: "1px",
  },
  logTxt: { fontSize: "12px", color: "#AEB6AF", lineHeight: 1.4 },
  foot: {
    fontSize: "11px",
    color: "#5E665F",
    textAlign: "center",
    marginTop: "18px",
    lineHeight: 1.5,
    maxWidth: "680px",
    marginLeft: "auto",
    marginRight: "auto",
  },
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Inter:wght@400;600;700&display=swap');
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
* { box-sizing: border-box; }
.seg { background: transparent; border: none; color: #7C857F; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 7px; cursor: pointer; letter-spacing: 0.03em; transition: .2s; }
.seg.on { background: #1E2A24; color: #39FF7A; }
.seg:focus-visible { outline: 2px solid #39FF7A; }
.btn { border: none; border-radius: 9px; font-size: 13px; font-weight: 700; padding: 10px 16px; cursor: pointer; letter-spacing: 0.02em; transition: .15s; font-family: 'Space Grotesk', sans-serif; }
.btn.primary { background: #39FF7A; color: #06140C; flex: 1; }
.btn.primary:hover { background: #5BFF93; }
.btn.primary:disabled { opacity: .5; cursor: wait; }
.btn.ghost { background: #131816; color: #AEB6AF; border: 1px solid #1F2622; }
.btn.ghost:hover { border-color: #39FF7A55; color: #E8EDE9; }
.btn:focus-visible, input:focus-visible { outline: 2px solid #39FF7A; }
textarea:focus, input:focus { outline: none; border-color: #39FF7A88; }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: #1E2622; border-radius: 4px; }
@media (max-width: 820px) { .grid-main { grid-template-columns: 1fr !important; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;
