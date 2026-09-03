/**
 * Estrutura semântica de diagramas (mecânico ou elétrico), produzida pelo Control Solver
 * e consumida pelo DiagramView (SVG determinístico). O solver decide a topologia; o
 * renderer só desenha o que a estrutura diz — nunca "adivinha" conexão.
 *
 * Modelo: nós nomeados + ramos (uma conexão de-para, com 1+ elementos em série dentro
 * dela) + fontes (mesma ideia, símbolo de fonte em vez de componente passivo). Vários
 * ramos com o mesmo par (de, para) são desenhados em paralelo automaticamente.
 */

export type ElementoTipo =
  // elétrico
  | "resistor"
  | "indutor"
  | "capacitor"
  | "transformador"
  | "motor_eletrico"
  | "fcem"
  // mecânico
  | "massa"
  | "mola"
  | "amortecedor"
  | "engrenagem"
  | "motor_mecanico"
  | "carga"
  | "eixo";

export type Elemento = {
  id: string;
  tipo: ElementoTipo;
  label: string;
};

export type No = {
  id: string;
  label?: string;
  /** Nó de referência/terra/fixo — desenhado como símbolo de terra, não como nó de rail. */
  terra?: boolean;
};

export type Ramo = {
  de: string;
  para: string;
  elementos: Elemento[];
};

export type Fonte = {
  id: string;
  tipo: "tensao" | "corrente" | "forca" | "torque";
  label: string;
  de: string;
  para: string;
};

export type DiagramaEstruturado = {
  tipo: "mecanico" | "eletrico";
  nos: No[];
  ramos: Ramo[];
  fontes?: Fonte[];
};

function isElemento(v: unknown): v is Elemento {
  const o = v as Partial<Elemento> | null;
  return !!o && typeof o.id === "string" && typeof o.tipo === "string" && typeof o.label === "string";
}

function isNo(v: unknown): v is No {
  const o = v as Partial<No> | null;
  return !!o && typeof o.id === "string";
}

function isRamo(v: unknown): v is Ramo {
  const o = v as Partial<Ramo> | null;
  return !!o && typeof o.de === "string" && typeof o.para === "string" && Array.isArray(o.elementos) && o.elementos.every(isElemento);
}

function isFonte(v: unknown): v is Fonte {
  const o = v as Partial<Fonte> | null;
  return !!o && typeof o.id === "string" && typeof o.de === "string" && typeof o.para === "string" && typeof o.label === "string";
}

/** Valida e normaliza um diagrama vindo do modelo. Retorna null se a estrutura estiver malformada
 * (nesse caso o frontend cai de volta para o texto em "itens", nunca quebra a tela). */
export function parseDiagrama(v: unknown): DiagramaEstruturado | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<DiagramaEstruturado>;
  if (o.tipo !== "mecanico" && o.tipo !== "eletrico") return null;
  if (!Array.isArray(o.nos) || !o.nos.every(isNo)) return null;
  if (!Array.isArray(o.ramos) || !o.ramos.every(isRamo)) return null;
  const fontes = Array.isArray(o.fontes) ? o.fontes.filter(isFonte) : [];
  if (o.ramos.length === 0 && fontes.length === 0) return null;
  return { tipo: o.tipo, nos: o.nos, ramos: o.ramos, fontes };
}
