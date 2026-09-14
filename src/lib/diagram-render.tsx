import katex from "katex";
import type { DiagramaEstruturado, ElementoTipo, No, Transformador } from "./diagram-types";

/**
 * Renderiza um DiagramaEstruturado como SVG determinístico.
 * O SOLVER decide nós/ramos/elementos/transformadores (topologia). Este componente só
 * desenha exatamente o que a estrutura descreve — nunca infere ou "adivinha" conexão.
 *
 * Layout: o circuito é dividido em "ilhas" (grupos de nós conectados só por ramos/fontes,
 * ignorando transformadores — que por natureza NÃO têm ligação elétrica direta entre os
 * lados). Cada ilha vira um mini-diagrama horizontal (rail + quedas pra terra), desenhado
 * lado a lado; transformadores são desenhados como duas bobinas na lacuna entre as ilhas
 * que eles conectam, sem nenhuma linha atravessando de um lado ao outro.
 */

const RAIL_Y = 70;
const X_SPACING = 150;
const MARGIN_X = 70;
const PARALLEL_GAP = 46;
const GROUND_DROP = 130;
const ISLAND_GAP = 60;
const TRANSFORMER_GAP = 150;

function renderLabelHtml(raw: string): string {
  const tex = raw.trim().replace(/^\$+/, "").replace(/\$+$/, "");
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode: false, strict: "ignore" });
  } catch {
    return tex;
  }
}

function KatexLabel({ x, y, text, width = 96 }: { x: number; y: number; text: string; width?: number }) {
  if (!text) return null;
  return (
    <foreignObject x={x - width / 2} y={y - 11} width={width} height={22} style={{ overflow: "visible" }}>
      <div
        // @ts-expect-error -- xmlns é necessário dentro de foreignObject em SVG
        xmlns="http://www.w3.org/1999/xhtml"
        style={{ textAlign: "center", fontSize: 12, lineHeight: "22px", color: "currentColor" }}
        dangerouslySetInnerHTML={{ __html: renderLabelHtml(text) }}
      />
    </foreignObject>
  );
}

type BranchItem = { tipo: ElementoTipo | "fonte_tensao" | "fonte_corrente"; label: string };
type Branch = { de: string; para: string; itens: BranchItem[] };

function Glyph({ tipo }: { tipo: BranchItem["tipo"] }) {
  const stroke = "currentColor";
  switch (tipo) {
    case "resistor":
      return (
        <path d="M-18,0 H-11 L-6,-9 L2,9 L8,-9 L14,9 L18,0" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      );
    case "mola":
      return (
        <path
          d="M-18,0 H-13 L-9,-9 L-3,9 L3,-9 L9,9 L13,-9 L18,0"
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      );
    case "indutor":
      return (
        <path d="M-18,0 H-12 A5,7 0 0 1 -2,0 A5,7 0 0 1 8,0 A5,7 0 0 1 12,0 H18" fill="none" stroke={stroke} strokeWidth={1.6} />
      );
    case "capacitor":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-18,0 H-4 M4,0 H18" />
          <path d="M-4,-10 V10 M4,-10 V10" />
        </g>
      );
    case "amortecedor":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-18,0 H-6 M6,0 H18" />
          <rect x={-6} y={-9} width={12} height={18} />
          <path d="M0,-9 V9" />
        </g>
      );
    case "massa":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <rect x={-14} y={-11} width={28} height={22} />
          <path d="M-14,-11 L14,11 M-14,11 L14,-11" strokeWidth={1} opacity={0.6} />
        </g>
      );
    case "engrenagem":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <circle r={10} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line key={i} x1={Math.cos(a) * 10} y1={Math.sin(a) * 10} x2={Math.cos(a) * 14} y2={Math.sin(a) * 14} />
            );
          })}
        </g>
      );
    case "motor_mecanico":
    case "motor_eletrico":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <circle r={12} />
          <text x={0} y={4} fontSize={11} textAnchor="middle" fill={stroke} stroke="none">
            M
          </text>
        </g>
      );
    case "fcem":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <circle r={11} />
          <text x={0} y={4} fontSize={9} textAnchor="middle" fill={stroke} stroke="none">
            fcem
          </text>
        </g>
      );
    case "transformador":
      // Fallback defensivo: se o modelo colocar "transformador" dentro de um ramo comum
      // (não deveria — deveria usar o campo "transformadores"), ainda desenha algo coerente.
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-6,-11 A4,6 0 0 1 -6,11 A4,6 0 0 1 -6,-11" />
          <path d="M6,-11 A4,6 0 0 1 6,11 A4,6 0 0 1 6,-11" />
          <path d="M0,-13 V13" strokeDasharray="2 2" />
        </g>
      );
    case "carga":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-14,-11 H14 V11 H-14 Z" />
          <path d="M-14,-11 L14,11 M-8,-11 L14,5 M-14,-5 L8,11" strokeWidth={1} opacity={0.6} />
        </g>
      );
    case "eixo":
      return <path d="M-18,0 H18" stroke={stroke} strokeWidth={3} />;
    case "fonte_tensao":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-18,0 H-11 M11,0 H18" />
          <circle r={11} />
          <text x={0} y={-1} fontSize={11} textAnchor="middle" fill={stroke} stroke="none">
            +
          </text>
          <text x={0} y={10} fontSize={11} textAnchor="middle" fill={stroke} stroke="none">
            −
          </text>
        </g>
      );
    case "fonte_corrente":
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-18,0 H-11 M11,0 H18" />
          <circle r={11} />
          <path d="M-5,4 L5,-4 M5,-4 L1,-4 M5,-4 L5,0" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    default:
      return <circle r={9} stroke={stroke} strokeWidth={1.6} fill="none" />;
  }
}

function ElementNode({ x, y, vertical, item }: { x: number; y: number; vertical: boolean; item: BranchItem }) {
  return (
    <g>
      <g transform={`translate(${x},${y}) rotate(${vertical ? 90 : 0})`}>
        <Glyph tipo={item.tipo} />
      </g>
      <KatexLabel x={vertical ? x + 34 : x} y={vertical ? y : y + 26} text={item.label} width={vertical ? 70 : 96} />
    </g>
  );
}

function NodeDot({ n, x, y }: { n: No; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={2.5} className="fill-current" />
      {n.label && <KatexLabel x={x} y={y - 20} text={n.label} />}
    </g>
  );
}

type IslandLayout = {
  elements: React.ReactNode[];
  width: number;
  railTop: number;
  height: number;
  /** Posição (dentro do SVG inteiro, já com o offset da ilha somado) de cada nó. */
  positions: Map<string, { x: number; y: number }>;
  groundY: number;
};

function layoutIsland(nodeIds: string[], diagrama: DiagramaEstruturado, xOffset: number, keySeed: string): IslandLayout {
  const nos = diagrama.nos.filter((n) => nodeIds.includes(n.id));
  const railNodes = nos.filter((n) => !n.terra);
  const hasTerra = nos.some((n) => n.terra);
  const nodeX = new Map<string, number>();
  railNodes.forEach((n, i) => nodeX.set(n.id, xOffset + MARGIN_X + i * X_SPACING));

  const branches: Branch[] = [
    ...diagrama.ramos
      .filter((r) => nodeIds.includes(r.de) && nodeIds.includes(r.para))
      .map((r) => ({ de: r.de, para: r.para, itens: r.elementos.map((e) => ({ tipo: e.tipo, label: e.label })) })),
    ...(diagrama.fontes ?? [])
      .filter((f) => nodeIds.includes(f.de) && nodeIds.includes(f.para))
      .map((f) => ({
        de: f.de,
        para: f.para,
        itens: [
          {
            tipo: (f.tipo === "tensao" || f.tipo === "forca" ? "fonte_tensao" : "fonte_corrente") as BranchItem["tipo"],
            label: f.label,
          },
        ],
      })),
  ];

  const pairKey = (a: string, b: string) => [a, b].sort().join("::");
  const parallelGroups = new Map<string, Branch[]>();
  const groundedByNode = new Map<string, Branch[]>();

  for (const b of branches) {
    const deTerra = nos.find((n) => n.id === b.de)?.terra;
    const paraTerra = nos.find((n) => n.id === b.para)?.terra;
    if (deTerra || paraTerra) {
      const railId = deTerra ? b.para : b.de;
      const list = groundedByNode.get(railId) ?? [];
      list.push(b);
      groundedByNode.set(railId, list);
    } else {
      const key = pairKey(b.de, b.para);
      const list = parallelGroups.get(key) ?? [];
      list.push(b);
      parallelGroups.set(key, list);
    }
  }

  const width = MARGIN_X * 2 + Math.max(1, railNodes.length - 1) * X_SPACING;
  const maxParallel = Math.max(1, ...Array.from(parallelGroups.values(), (g) => g.length));
  const maxGrounded = Math.max(0, ...Array.from(groundedByNode.values(), (g) => g.length));
  const railTop = RAIL_Y - (maxParallel - 1) * PARALLEL_GAP - 30;
  const groundY = RAIL_Y + GROUND_DROP;
  const height = groundY + (maxGrounded > 0 ? 40 : 10);

  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, x] of nodeX) positions.set(id, { x, y: RAIL_Y });

  const elements: React.ReactNode[] = [];
  let gi = 0;
  for (const [, group] of parallelGroups) {
    group.forEach((branch, offsetIdx) => {
      const x1 = nodeX.get(branch.de) ?? xOffset + MARGIN_X;
      const x2 = nodeX.get(branch.para) ?? xOffset + MARGIN_X + X_SPACING;
      const y = RAIL_Y - offsetIdx * PARALLEL_GAP;
      const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
      elements.push(
        <g key={`${keySeed}-p-${gi}-${offsetIdx}`}>
          {offsetIdx > 0 && (
            <>
              <path d={`M${xa},${RAIL_Y} V${y}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
              <path d={`M${xb},${RAIL_Y} V${y}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
            </>
          )}
          <path d={`M${xa},${y} H${xb}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
          {branch.itens.map((item, i) => {
            const n = branch.itens.length;
            const ex = xa + ((xb - xa) * (i + 1)) / (n + 1);
            return <ElementNode key={i} x={ex} y={y} vertical={false} item={item} />;
          })}
        </g>,
      );
    });
    gi++;
  }

  let gj = 0;
  const groundXs: number[] = [];
  for (const [nodeId, group] of groundedByNode) {
    const baseX = nodeX.get(nodeId) ?? xOffset + MARGIN_X;
    group.forEach((branch, offsetIdx) => {
      const dx = (offsetIdx - (group.length - 1) / 2) * 30;
      const x = baseX + dx;
      groundXs.push(x);
      elements.push(
        <g key={`${keySeed}-g-${gj}-${offsetIdx}`}>
          <path d={`M${baseX},${RAIL_Y} L${x},${RAIL_Y + 14}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
          <path d={`M${x},${groundY} V${RAIL_Y + 14}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
          {branch.itens.map((item, i) => {
            const n = branch.itens.length;
            const ey = RAIL_Y + 14 + ((groundY - (RAIL_Y + 14)) * (i + 1)) / (n + 1);
            return <ElementNode key={i} x={x} y={ey} vertical={true} item={item} />;
          })}
        </g>,
      );
    });
    gj++;
  }

  if (hasTerra && groundXs.length > 0) {
    const gx = groundXs.reduce((a, b) => a + b, 0) / groundXs.length;
    const terraNode = nos.find((n) => n.terra);
    if (terraNode) positions.set(terraNode.id, { x: gx, y: groundY });
    elements.push(
      <g key={`${keySeed}-terra`} transform={`translate(${gx},${groundY})`}>
        <path d="M-16,0 H16 M-10,6 H10 M-4,12 H4" stroke="currentColor" strokeWidth={1.6} fill="none" />
      </g>,
    );
  }

  for (const n of railNodes) {
    const x = nodeX.get(n.id);
    if (x !== undefined) elements.unshift(<NodeDot key={`${keySeed}-node-${n.id}`} n={n} x={x} y={RAIL_Y} />);
  }

  return { elements, width, railTop, height, positions, groundY };
}

/** Duas bobinas lado a lado (sem nenhuma linha elétrica entre elas — só acoplamento). */
function TransformerBridge({
  t,
  x,
  yTop,
  yBottom,
  fromPos,
  toPos,
}: {
  t: Transformador;
  x: number;
  yTop: number;
  yBottom: number;
  fromPos: { primDe?: { x: number; y: number } | undefined; primPara?: { x: number; y: number } | undefined };
  toPos: { secDe?: { x: number; y: number } | undefined; secPara?: { x: number; y: number } | undefined };
}) {
  const coilPrimX = x - 9;
  const coilSecX = x + 9;
  const step = (yBottom - yTop) / 4;
  return (
    <g>
      {fromPos.primDe && (
        <path d={`M${fromPos.primDe.x},${fromPos.primDe.y} H${coilPrimX}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
      )}
      {fromPos.primPara && (
        <path
          d={`M${fromPos.primPara.x},${fromPos.primPara.y} H${coilPrimX}`}
          stroke="currentColor"
          strokeWidth={1.4}
          fill="none"
          strokeDasharray="3 2"
        />
      )}
      {toPos.secDe && (
        <path d={`M${coilSecX},${yTop} H${toPos.secDe.x} V${toPos.secDe.y}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
      )}
      {toPos.secPara && (
        <path
          d={`M${coilSecX},${yBottom} H${toPos.secPara.x} V${toPos.secPara.y}`}
          stroke="currentColor"
          strokeWidth={1.4}
          fill="none"
          strokeDasharray="3 2"
        />
      )}
      <path
        d={Array.from({ length: 4 }, (_, i) => `M${coilPrimX},${yTop + i * step} q6,${step / 2} 0,${step}`).join(" ")}
        stroke="currentColor"
        strokeWidth={1.6}
        fill="none"
      />
      <path
        d={Array.from({ length: 4 }, (_, i) => `M${coilSecX},${yTop + i * step} q-6,${step / 2} 0,${step}`).join(" ")}
        stroke="currentColor"
        strokeWidth={1.6}
        fill="none"
      />
      <path d={`M${x},${yTop - 4} V${yBottom + 4}`} stroke="currentColor" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
      {t.label && <KatexLabel x={x} y={yTop - 16} text={t.label} width={90} />}
    </g>
  );
}

function partitionIslands(diagrama: DiagramaEstruturado): string[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    let p = parent.get(id)!;
    while (p !== parent.get(p)) p = parent.get(p)!;
    parent.set(id, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const n of diagrama.nos) find(n.id);
  for (const r of diagrama.ramos) union(r.de, r.para);
  for (const f of diagrama.fontes ?? []) union(f.de, f.para);
  // Transformadores NÃO unem ilhas — é isso que garante lados separados.

  const groups = new Map<string, string[]>();
  for (const n of diagrama.nos) {
    const root = find(n.id);
    const list = groups.get(root) ?? [];
    list.push(n.id);
    groups.set(root, list);
  }

  // Ordena ilhas pela primeira aparição de algum de seus nós em diagrama.nos.
  const order = diagrama.nos.map((n) => n.id);
  return Array.from(groups.values()).sort((a, b) => {
    const ia = Math.min(...a.map((id) => order.indexOf(id)));
    const ib = Math.min(...b.map((id) => order.indexOf(id)));
    return ia - ib;
  });
}

export function DiagramView({ diagrama }: { diagrama: DiagramaEstruturado }) {
  const islandsNodeIds = partitionIslands(diagrama);
  const transformadores = diagrama.transformadores ?? [];

  const islandOf = (nodeId: string) => islandsNodeIds.findIndex((ids) => ids.includes(nodeId));
  const bridgesAfterIsland = new Set<number>();
  for (const t of transformadores) {
    const i1 = islandOf(t.primario.de);
    const i2 = islandOf(t.secundario.de);
    if (i1 >= 0 && i2 >= 0) bridgesAfterIsland.add(Math.min(i1, i2));
  }

  let xOffset = 0;
  const layouts: IslandLayout[] = [];
  islandsNodeIds.forEach((ids, idx) => {
    const layout = layoutIsland(ids, diagrama, xOffset, `isl${idx}`);
    layouts.push(layout);
    xOffset += layout.width + (bridgesAfterIsland.has(idx) ? TRANSFORMER_GAP : ISLAND_GAP);
  });

  const allPositions = new Map<string, { x: number; y: number }>();
  for (const l of layouts) for (const [id, pos] of l.positions) allPositions.set(id, pos);

  const totalWidth = xOffset;
  const railTop = Math.min(...layouts.map((l) => l.railTop), RAIL_Y - 30);
  const totalHeight = Math.max(...layouts.map((l) => l.height), RAIL_Y + GROUND_DROP + 10);
  const groundY = layouts[0]?.groundY ?? RAIL_Y + GROUND_DROP;

  const islandRightEdge: number[] = [];
  let cumulative = 0;
  layouts.forEach((l, idx) => {
    cumulative += l.width;
    islandRightEdge[idx] = cumulative;
    cumulative += bridgesAfterIsland.has(idx) ? TRANSFORMER_GAP : ISLAND_GAP;
  });

  const bridges: React.ReactNode[] = transformadores.flatMap((t, i) => {
    const i1 = islandOf(t.primario.de);
    if (i1 < 0) return [];
    const bridgeX = islandRightEdge[i1]! + TRANSFORMER_GAP / 2;
    return [
      <TransformerBridge
        key={`bridge-${i}`}
        t={t}
        x={bridgeX}
        yTop={RAIL_Y}
        yBottom={groundY}
        fromPos={{ primDe: allPositions.get(t.primario.de), primPara: allPositions.get(t.primario.para) }}
        toPos={{ secDe: allPositions.get(t.secundario.de), secPara: allPositions.get(t.secundario.para) }}
      />,
    ];
  });

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 ${railTop} ${totalWidth} ${totalHeight - railTop}`}
        width="100%"
        height={Math.max(160, totalHeight - railTop)}
        className="text-foreground"
        role="img"
        aria-label={`Diagrama ${diagrama.tipo}`}
      >
        {layouts.flatMap((l) => l.elements)}
        {bridges}
      </svg>
    </div>
  );
}
