import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Type, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { solveExercise, type SolveResult, type SubBlock } from "@/lib/solver.functions";
import { MathInline, MathLine, MathLines } from "@/lib/math-render";
import { DiagramView } from "@/lib/diagram-render";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Control Engineering Solver — Resolução de exercícios de Controle" },
      {
        name: "description",
        content:
          "Envie um exercício de Controle e Servomecanismos por texto, imagem ou PDF e receba a resolução matemática completa, fase a fase, seguindo a metodologia de conversão eletromecânica.",
      },
      { property: "og:title", content: "Control Engineering Solver" },
      {
        property: "og:description",
        content:
          "Resolução matemática completa de exercícios de Controle e Servomecanismos, no padrão de prova, fase a fase.",
      },
    ],
  }),
  component: SolverPage,
});

type Attachment = {
  kind: "image" | "pdf";
  filename: string;
  dataUrl: string;
  mimeType: string;
};

const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="panel px-5 py-4">
      <h2 className="section-label">{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Um dos 10 sub-blocos nomeados da cadeia eletromecânica — só renderiza se aplicável. */
function SubBlockSection({ number, label, block }: { number: string; label: string; block: SubBlock }) {
  if (!block.aplicavel || (block.itens.length === 0 && !block.diagrama)) return null;
  return (
    <Section label={`${number}. ${label}`}>
      {block.diagrama && (
        <div className="mb-3 rounded-md border border-border bg-background/40 p-3">
          <DiagramView diagrama={block.diagrama} />
        </div>
      )}
      <MathLines lines={block.itens} />
    </Section>
  );
}

function ConversionTable({ linhas }: { linhas: Array<{ mecanico: string; eletrico: string }> }) {
  if (!linhas.length) return null;
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left font-mono text-xs text-muted-foreground">
          <th className="py-1.5 pr-4">Mecânico</th>
          <th className="py-1.5">Elétrico</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            <td className="py-1.5 pr-4 math-line">
              <MathInline text={l.mecanico} />
            </td>
            <td className="py-1.5 math-line">
              <MathInline text={l.eletrico} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SolverPage() {
  const solve = useServerFn(solveExercise);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const mutation = useMutation<SolveResult, Error>({
    mutationFn: () => solve({ data: { text: text.trim() || undefined, attachment: attachment ?? undefined } }),
  });

  const handleFile = async (file: File | undefined, kind: "image" | "pdf") => {
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_BYTES) {
      setFileError("Arquivo maior que 8 MB. Envie uma versão mais leve ou apenas a página da questão.");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      setAttachment({ kind, filename: file.name, dataUrl, mimeType: file.type });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Falha ao ler o arquivo.");
    }
  };

  const result = mutation.data;
  const canSubmit = (text.trim().length > 0 || attachment !== null) && !mutation.isPending;
  const eletro = result?.eletromecanica;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <header className="text-center">
        <h1 className="font-mono text-xl font-medium tracking-[0.14em] text-foreground sm:text-2xl">
          CONTROL ENGINEERING SOLVER
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Envie seu exercício de Controle e Servomecanismos
        </p>
      </header>

      <div className="panel mt-8 p-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => imageInput.current?.click()}>
            <ImageIcon /> Inserir imagem
          </Button>
          <Button variant="secondary" size="sm" onClick={() => pdfInput.current?.click()}>
            <FileText /> Enviar PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={() => textArea.current?.focus()}>
            <Type /> Digitar exercício
          </Button>
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0], "image")}
          />
          <input
            ref={pdfInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0], "pdf")}
          />
        </div>

        {attachment && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-secondary px-3 py-2">
            <span className="truncate font-mono text-xs text-secondary-foreground">
              {attachment.kind === "image" ? "Imagem" : "PDF"}: {attachment.filename}
            </span>
            <button
              type="button"
              aria-label="Remover arquivo"
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setAttachment(null)}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {fileError && <p className="mt-3 text-xs text-destructive">{fileError}</p>}

        <Textarea
          ref={textArea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Ex.: Para G(s) = K/(s(s+2)(s+4)) com realimentação unitária, determine K para ζ = 0,5 pelo lugar das raízes."}
          className="mt-4 min-h-32 font-mono text-sm"
        />

        <Button
          className="mt-4 w-full font-mono tracking-[0.16em]"
          size="lg"
          disabled={!canSubmit}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
          {mutation.isPending ? "RESOLVENDO" : "RESOLVER"}
        </Button>

        {mutation.isPending && (
          <p className="mt-3 text-center font-mono text-xs text-muted-foreground">
            ENTENDER → MODELAR → ESCOLHER MÉTODO → RESOLVER → VERIFICAR
          </p>
        )}
        {mutation.isError && (
          <p className="mt-3 text-sm text-destructive">{mutation.error.message}</p>
        )}
      </div>

      {result && (
        <div className="mt-10 space-y-4">
          {result.ilegivel.length > 0 && (
            <div className="panel border-warning/60 px-5 py-4">
              <h2 className="section-label text-warning">Trechos não legíveis</h2>
              <MathLines lines={result.ilegivel} />
            </div>
          )}

          {result.insuficiente ? (
            <Section label="Dados insuficientes">
              <p className="text-sm text-foreground">
                Dados insuficientes para determinar unicamente o resultado. Informe:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 math-line">
                {result.faltando.map((f, i) => (
                  <li key={i}>
                    <MathInline text={f} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : (
            <>
              {/* Sub-bloco 1 — Interpretação */}
              <Section label="1. Interpretação">
                <div className="space-y-1 math-line">
                  {result.interpretacao.entrada && (
                    <p>
                      <span className="text-muted-foreground">Entrada: </span>
                      <MathInline text={result.interpretacao.entrada} />
                    </p>
                  )}
                  {result.interpretacao.saida && (
                    <p>
                      <span className="text-muted-foreground">Saída: </span>
                      <MathInline text={result.interpretacao.saida} />
                    </p>
                  )}
                </div>
                {result.interpretacao.itens.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 math-line">
                    {result.interpretacao.itens.map((it, i) => (
                      <li key={i}>
                        <MathInline text={it} />
                      </li>
                    ))}
                  </ul>
                )}
                {result.topicos.length > 0 && (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    tópicos: {result.topicos.join(", ")}
                  </p>
                )}
              </Section>

              {result.ambiguidade?.existe && (
                <div className="panel border-warning/60 px-5 py-4">
                  <h2 className="section-label text-warning">Ambiguidade no enunciado</h2>
                  <div className="mt-3 space-y-1 math-line">
                    <p>
                      Interpretação A: <MathInline text={result.ambiguidade.interpretacao_a ?? ""} />
                    </p>
                    <p>
                      Interpretação B: <MathInline text={result.ambiguidade.interpretacao_b ?? ""} />
                    </p>
                    <p>
                      Utilizada: {result.ambiguidade.escolhida} —{" "}
                      <MathInline text={result.ambiguidade.motivo ?? ""} />
                    </p>
                  </div>
                </div>
              )}

              {/* Sub-blocos 2–11 — cadeia de conversão eletromecânica (só quando aplicável) */}
              {eletro?.aplicavel && (
                <>
                  <SubBlockSection number="2" label="Diagrama Mecânico" block={eletro.diagrama_mecanico} />

                  {eletro.tabela_conversao.aplicavel && eletro.tabela_conversao.linhas.length > 0 && (
                    <Section label="3. Tabela de Conversão">
                      {eletro.analogia && eletro.analogia !== "nao_aplicavel" && (
                        <p className="mb-2 font-mono text-xs text-accent">
                          Analogia: {eletro.analogia.replace(/_/g, "-")}
                        </p>
                      )}
                      <ConversionTable linhas={eletro.tabela_conversao.linhas} />
                    </Section>
                  )}

                  <SubBlockSection
                    number="4"
                    label="Conversão Mecânico → Elétrico"
                    block={eletro.conversao_mecanico_eletrico}
                  />
                  <SubBlockSection number="5" label="Diagrama Elétrico Equivalente" block={eletro.diagrama_eletrico} />
                  <SubBlockSection number="6" label="Redução do Sistema Elétrico" block={eletro.reducao_circuito} />
                  <SubBlockSection number="7" label="Equações Elétricas" block={eletro.equacoes_eletricas} />
                  <SubBlockSection number="8" label="Sistema Linear / Matriz" block={eletro.sistema_matricial} />
                  <SubBlockSection number="9" label="Resolução do Sistema" block={eletro.resolucao_sistema} />
                  <SubBlockSection
                    number="10"
                    label="Conversão Elétrico → Mecânico"
                    block={eletro.conversao_eletrico_mecanico}
                  />
                  <SubBlockSection number="11" label="Obtenção da Saída y" block={eletro.obtencao_saida} />
                </>
              )}

              {/* Método de Controle propriamente dito (Routh, lugar das raízes, Bode etc.) */}
              {result.resolucao.length > 0 && (
                <Section label="Método de Controle">
                  <div className="space-y-4">
                    {result.resolucao.map((etapa, i) => (
                      <div key={i}>
                        <h3 className="font-mono text-xs text-muted-foreground">{etapa.titulo}</h3>
                        <div className="mt-1">
                          <MathLines lines={etapa.passos} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Sub-bloco 12 — Resultado final */}
              {(result.resultado_final.entrada ||
                result.resultado_final.saida ||
                result.resultado_final.resultado) && (
                <Section label="12. Resultado Final">
                  <div className="space-y-1 math-line">
                    {result.resultado_final.entrada && (
                      <p>
                        <span className="text-muted-foreground">Entrada: </span>
                        <MathInline text={result.resultado_final.entrada} />
                      </p>
                    )}
                    {result.resultado_final.saida && (
                      <p>
                        <span className="text-muted-foreground">Saída: </span>
                        <MathInline text={result.resultado_final.saida} />
                      </p>
                    )}
                    {result.resultado_final.resultado && (
                      <p className="mt-2 text-base">
                        <MathInline text={result.resultado_final.resultado} />
                      </p>
                    )}
                  </div>
                </Section>
              )}

              <Section label="Resultados">
                <div className="space-y-1">
                  {result.resultados.map((r, i) => (
                    <MathLine
                      key={i}
                      line={`${r.grandeza} = ${r.valor}${r.unidade ? ` ${r.unidade}` : ""}`}
                    />
                  ))}
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    Verificação: {result.verificacao.aprovado ? "aprovada" : "com ressalvas"}
                    {result.verificacao.revisado ? " (resolução recalculada após reprovação)" : ""}
                  </p>
                  {result.verificacao.motor_matematico && (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Motor matemático: <MathInline text={result.verificacao.motor_matematico} />
                    </p>
                  )}
                  {result.verificacao.observacoes.map((o, i) => (
                    <p key={i} className="mt-1 font-mono text-xs text-muted-foreground">
                      · <MathInline text={o} />
                    </p>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
