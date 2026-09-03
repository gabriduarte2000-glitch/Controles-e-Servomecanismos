import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Type, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { solveExercise, type SolveResult } from "@/lib/solver.functions";
import { MathInline, MathLine, MathLines } from "@/lib/math-render";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Control Engineering Solver — Resolução de exercícios de Controle" },
      {
        name: "description",
        content:
          "Envie um exercício de Controle e Servomecanismos por texto, imagem ou PDF e receba a resolução matemática completa passo a passo com o código MATLAB correspondente.",
      },
      { property: "og:title", content: "Control Engineering Solver" },
      {
        property: "og:description",
        content:
          "Resolução matemática completa de exercícios de Controle e Servomecanismos, no padrão de prova, com código MATLAB.",
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
            ENTENDER → MODELAR → ESCOLHER MÉTODO → RESOLVER → VERIFICAR → GERAR MATLAB
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
              <Section label="Questão">
                <p className="text-sm leading-relaxed text-foreground">
                  <MathInline text={result.questao} />
                </p>
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

              <Section label="O que foi pedido">
                <ul className="list-disc space-y-1 pl-5 math-line">
                  {result.pedido.map((p, i) => (
                    <li key={i}>
                      <MathInline text={p} />
                    </li>
                  ))}
                </ul>
              </Section>

              <Section label="Dados">
                <MathLines lines={result.dados} />
              </Section>

              <Section label="Resolução">
                {result.modelagem.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-mono text-xs text-muted-foreground">Modelagem</h3>
                    <div className="mt-1">
                      <MathLines lines={result.modelagem} />
                    </div>
                  </div>
                )}
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

              <Section label="MATLAB">
                <pre className="overflow-x-auto rounded-md bg-background/60 p-4 math-line">
                  <code>{result.matlab}</code>
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => void navigator.clipboard.writeText(result.matlab)}
                >
                  Copiar código
                </Button>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  O código é apresentado, não executado — nenhum gráfico é renderizado aqui.
                </p>
              </Section>
            </>
          )}
        </div>
      )}
    </main>
  );
}
