import type { DiagramaEstruturado, Elemento, ElementoTipo, No } from "./diagram-types";

/**
 * Renderiza um DiagramaEstruturado como SVG determinístico.
 * O SOLVER decide nós/ramos/elementos (topologia). Este componente só desenha
 * exatamente o que a estrutura descreve — nunca infere ou "adivinha" conexão.
 *
 * Layout: nós não-terra formam um "rail" horizontal (ordem = ordem em diagrama.nos).
 * Ramos entre dois nós do rail viram segmentos horizontais entre eles (empilhados
 * quando há mais de um em paralelo entre o mesmo par). Ramos que terminam em nó de
 * terra viram uma queda vertical até um trilho de referência comum, com o símbolo
 * de terra desenhado uma vez.
 */

const RAIL_Y = 70;
const X_SPACING = 150;
const MARGIN_X = 70;
const PARALLEL_GAP = 46;
const GROUND_DROP = 130;

type Branch = {
  de: string;
  para: string;
  itens: Array<{ tipo: ElementoTipo | "fonte_tensao" | "fonte_corrente"; label: string }>;
};

function toBranches(diagrama: DiagramaEstruturado): Branch[] {
  const ramos: Branch[] = diagrama.ramos.map((r) => ({
    de: r.de,
    para: r.para,
    itens: r.elementos.map((e) => ({ tipo: e.tipo, label: e.label })),
  }));
  const fontes: Branch[] = (diagrama.fontes ?? []).map((f) => ({
    de: f.de,
    para: f.para,
    itens: [{ tipo: f.tipo === "tensao" || f.tipo === "forca" ? "fonte_tensao" : "fonte_corrente", label: f.label }],
  }));
  return [...ramos, ...fontes];
}

function Glyph({ tipo }: { tipo: Branch["itens"][number]["tipo"] }) {
  const stroke = "currentColor";
  switch (tipo) {
    case "resistor":
      return (
        <path
          d="M-18,0 H-11 L-6,-9 L2,9 L8,-9 L14,9 L18,0"
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
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
        <path
          d="M-18,0 H-12 A5,7 0 0 1 -2,0 A5,7 0 0 1 8,0 A5,7 0 0 1 12,0 H18"
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
        />
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
          <path d="M0,-9 V9" strokeDasharray="0" />
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
            const x1 = Math.cos(a) * 10;
            const y1 = Math.sin(a) * 10;
            const x2 = Math.cos(a) * 14;
            const y2 = Math.sin(a) * 14;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
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
      return (
        <g stroke={stroke} strokeWidth={1.6} fill="none">
          <path d="M-18,-6 A4,6 0 0 1 -18,6 A4,6 0 0 1 -18,-6" transform="translate(-4,0)" />
          <path d="M0,-8 A5,8 0 0 1 0,8 A5,8 0 0 1 0,-8" transform="translate(4,0)" />
          <path d="M-2,-11 V11 M2,-11 V11" strokeDasharray="2 2" />
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

function Element({ x, y, vertical, item }: { x: number; y: number; vertical: boolean; item: Branch["itens"][number] }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${vertical ? 90 : 0})`}>
      <Glyph tipo={item.tipo} />
      <text
        x={0}
        y={vertical ? -18 : 26}
        fontSize={12}
        textAnchor="middle"
        className="fill-current"
        transform={vertical ? `rotate(${-90})` : undefined}
      >
        {item.label.replace(/\$/g, "")}
      </text>
    </g>
  );
}

export function DiagramView({ diagrama }: { diagrama: DiagramaEstruturado }) {
  const railNodes = diagrama.nos.filter((n) => !n.terra);
  const hasTerra = diagrama.nos.some((n) => n.terra);
  const nodeX = new Map<string, number>();
  railNodes.forEach((n, i) => nodeX.set(n.id, MARGIN_X + i * X_SPACING));

  const branches = toBranches(diagrama);

  // Agrupa ramos paralelos pelo par (de,para) não-ordenado, só entre nós do rail.
  const pairKey = (a: string, b: string) => [a, b].sort().join("::");
  const parallelGroups = new Map<string, Branch[]>();
  const groundedByNode = new Map<string, Branch[]>();

  for (const b of branches) {
    const deTerra = diagrama.nos.find((n) => n.id === b.de)?.terra;
    const paraTerra = diagrama.nos.find((n) => n.id === b.para)?.terra;
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

  const railToRailElements: React.ReactNode[] = [];
  let groupIndex = 0;
  for (const [, group] of parallelGroups) {
    group.forEach((branch, offsetIdx) => {
      const x1 = nodeX.get(branch.de) ?? MARGIN_X;
      const x2 = nodeX.get(branch.para) ?? MARGIN_X + X_SPACING;
      const y = RAIL_Y - offsetIdx * PARALLEL_GAP;
      const [xa, xb] = x1 <= x2 ? [x1, x2] : [x2, x1];
      railToRailElements.push(
        <g key={`branch-${groupIndex}-${offsetIdx}`}>
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
            return <Element key={i} x={ex} y={y} vertical={false} item={item} />;
          })}
        </g>,
      );
    });
    groupIndex++;
  }

  const groundedElements: React.ReactNode[] = [];
  let gIndex = 0;
  const groundXs: number[] = [];
  for (const [nodeId, group] of groundedByNode) {
    const baseX = nodeX.get(nodeId) ?? MARGIN_X;
    group.forEach((branch, offsetIdx) => {
      const dx = (offsetIdx - (group.length - 1) / 2) * 30;
      const x = baseX + dx;
      groundXs.push(x);
      groundedElements.push(
        <g key={`gnd-${gIndex}-${offsetIdx}`}>
          <path d={`M${baseX},${RAIL_Y} L${x},${RAIL_Y + 14}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
          <path d={`M${x},${groundY} V${RAIL_Y + 14}`} stroke="currentColor" strokeWidth={1.4} fill="none" />
          {branch.itens.map((item, i) => {
            const n = branch.itens.length;
            const ey = RAIL_Y + 14 + ((groundY - (RAIL_Y + 14)) * (i + 1)) / (n + 1);
            return <Element key={i} x={x} y={ey} vertical={true} item={item} />;
          })}
        </g>,
      );
    });
    gIndex++;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 ${railTop} ${width} ${height - railTop}`}
        width="100%"
        height={Math.max(160, height - railTop)}
        className="text-foreground"
        role="img"
        aria-label={`Diagrama ${diagrama.tipo}`}
      >
        {railNodes.map((n) => (
          <NodeDot key={n.id} n={n} x={nodeX.get(n.id) ?? 0} y={RAIL_Y} />
        ))}
        {railToRailElements}
        {groundedElements}
        {hasTerra && groundXs.length > 0 && (
          <g transform={`translate(${groundXs.reduce((a, b) => a + b, 0) / groundXs.length},${groundY})`}>
            <path d="M-16,0 H16 M-10,6 H10 M-4,12 H4" stroke="currentColor" strokeWidth={1.6} fill="none" />
          </g>
        )}
      </svg>
    </div>
  );
}

function NodeDot({ n, x, y }: { n: No; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={2.5} className="fill-current" />
      {n.label && (
        <text x={x} y={y - 14} fontSize={12} textAnchor="middle" className="fill-current">
          {n.label.replace(/\$/g, "")}
        </text>
      )}
    </g>
  );
}
