import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renderização de linhas produzidas pelo Control Solver.
 * Convenções esperadas do modelo (ver FORMATAÇÃO MATEMÁTICA em control-prompts.server.ts):
 * - Texto com trechos matemáticos pontuais: "...  $\zeta = 0.5$  ..."
 * - Linha inteira é uma equação/matriz: "$$1 + KG(s)H(s) = 0$$"
 * - Linha inteira é um diagrama ASCII: "```\n[desenho]\n```"
 * O modelo às vezes usa $$...$$ mesmo embutido numa frase (fora do padrão pedido) —
 * o parser abaixo entende os dois casos misturados na mesma linha, e qualquer "$"
 * que sobrar sem par é removido antes de exibir (nunca aparece $ literal na tela).
 * Qualquer erro de LaTeX cai de volta para o texto puro, nunca quebra a tela.
 */

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode, strict: "ignore" });
  } catch {
    return tex;
  }
}

// Tenta casar primeiro um bloco $$...$$ e, se não houver, um trecho $...$.
const MATH_SEGMENT = /(\$\$[^$]+\$\$|\$[^$]+\$)/g;

/** Divide um texto em segmentos, renderizando cada trecho $...$/$$...$$ como LaTeX inline. */
export function MathInline({ text }: { text: string }) {
  if (!text || !text.includes("$")) return <>{text}</>;

  const parts = text.split(MATH_SEGMENT);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("$$") && part.endsWith("$$") && part.length > 4) {
          return (
            <span
              key={i}
              className="katex-inline"
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(2, -2), false) }}
            />
          );
        }
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          return (
            <span
              key={i}
              className="katex-inline"
              dangerouslySetInnerHTML={{ __html: renderTex(part.slice(1, -1), false) }}
            />
          );
        }
        // Texto puro: remove qualquer "$" órfão que não fez par (nunca mostra $ literal).
        return <span key={i}>{part.includes("$") ? part.replace(/\$/g, "") : part}</span>;
      })}
    </>
  );
}

/** Uma linha completa: detecta diagrama ASCII, equação em bloco ($$...$$) ou texto com LaTeX inline. */
export function MathLine({ line, className = "" }: { line: string; className?: string }) {
  const trimmed = line.trim();

  if (trimmed.startsWith("```")) {
    const content = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
    return (
      <pre
        className={`overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground ${className}`}
      >
        <code>{content}</code>
      </pre>
    );
  }

  if (trimmed.length > 4 && trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
    return (
      <div
        className={`my-1 overflow-x-auto text-foreground ${className}`}
        dangerouslySetInnerHTML={{ __html: renderTex(trimmed.slice(2, -2), true) }}
      />
    );
  }

  return (
    <p className={`math-line ${className}`}>
      <MathInline text={line} />
    </p>
  );
}

export function MathLines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <MathLine key={i} line={line} className={className ?? ""} />
      ))}
    </div>
  );
}
