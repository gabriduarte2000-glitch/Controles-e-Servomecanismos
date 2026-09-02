/**
 * Motor matemático numérico. O LLM decide o procedimento,
 * este módulo executa o cálculo, o LLM interpreta o resultado.
 */

type C = { re: number; im: number };

const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a: C, b: C): C => ({ re: a.re - b.re, im: a.im - b.im });
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const abs = (a: C) => Math.hypot(a.re, a.im);

/** Raízes de um polinômio de coeficientes reais (ordem decrescente) — Durand-Kerner. */
export function polynomialRoots(coeffs: number[]): C[] {
  const c = [...coeffs];
  while (c.length && Math.abs(c[0]!) < 1e-14) c.shift();
  const n = c.length - 1;
  if (n < 1) return [];

  const monic = c.map((v) => v / c[0]!);
  let roots: C[] = Array.from({ length: n }, (_, k) => ({
    re: 0.4 + 0.9 * Math.cos((2 * Math.PI * k) / n),
    im: 0.9 * Math.sin((2 * Math.PI * k) / n),
  }));

  const evalPoly = (z: C): C => {
    let acc: C = { re: 0, im: 0 };
    for (const a of monic) acc = add(mul(acc, z), { re: a, im: 0 });
    return acc;
  };

  for (let iter = 0; iter < 500; iter++) {
    let maxDelta = 0;
    roots = roots.map((zi, i) => {
      let denom: C = { re: 1, im: 0 };
      roots.forEach((zj, j) => {
        if (i !== j) denom = mul(denom, sub(zi, zj));
      });
      if (abs(denom) < 1e-18) return zi;
      const delta = div(evalPoly(zi), denom);
      maxDelta = Math.max(maxDelta, abs(delta));
      return sub(zi, delta);
    });
    if (maxDelta < 1e-12) break;
  }

  const round = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
  return roots
    .map(({ re, im }) => ({ re: round(re), im: round(im) }))
    .sort((a, b) => a.re - b.re || a.im - b.im);
}

export function formatRoots(coeffs: number[]): string {
  if (!Array.isArray(coeffs) || coeffs.length < 2) return "não aplicável";
  let roots: C[];
  try {
    roots = polynomialRoots(coeffs);
  } catch {
    return "não aplicável";
  }
  if (!roots.length) return "não aplicável";
  const list = roots
    .map(({ re, im }) => (im === 0 ? `${re}` : `${re} ${im > 0 ? "+" : "-"} j${Math.abs(im)}`))
    .join(", ");
  const marginal = roots.some((r) => Math.abs(r.re) < 1e-9);
  const stable = roots.every((r) => r.re < 0);
  return `raízes = { ${list} } → ${
    marginal
      ? "estabilidade marginal (raiz no eixo imaginário)"
      : stable
        ? "todas no semiplano esquerdo (estável)"
        : "há raiz no semiplano direito (instável)"
  }`;
}
