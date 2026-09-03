/**
 * LLMProvider — única camada de acesso ao modelo de linguagem.
 * Trocar de provedor/modelo no futuro exige mudar apenas este arquivo.
 *
 * Usa a API do Gemini (Google) diretamente, com uma chave própria (GEMINI_API_KEY),
 * independente da conta/projeto Lovable. Gere uma chave grátis em
 * https://aistudio.google.com/apikey e configure GEMINI_API_KEY nas variáveis
 * de ambiente do seu provedor de deploy (Vercel: Project Settings → Environment Variables).
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export const MODELS = {
  /** Leitura multimodal (imagem/PDF) e classificação — barato/rápido. */
  fast: "gemini-3.5-flash-lite",
  /** Resolução matemática e verificação — raciocínio. */
  reasoning: "gemini-3.5-flash",
} as const;

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type FilePart = {
  type: "file";
  file: { filename: string; file_data: string };
};
export type ContentPart = TextPart | ImagePart | FilePart;

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export class LlmError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type CallOptions = {
  model?: string;
  messages: LlmMessage[];
  json?: boolean;
};

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

/** Extrai mimeType e base64 de uma data URL (ex.: "data:image/png;base64,AAAA..."). */
function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    throw new LlmError(400, "Arquivo enviado em formato inesperado (esperado data URL base64).");
  }
  return { mimeType: match[1]!, data: match[2]! };
}

function toGeminiRequest(messages: LlmMessage[]): {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
} {
  const systemChunks: string[] = [];
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemChunks.push(typeof message.content === "string" ? message.content : "");
      continue;
    }

    const role: "user" | "model" = message.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] =
      typeof message.content === "string"
        ? [{ text: message.content }]
        : message.content.map((part): GeminiPart => {
            if (part.type === "text") return { text: part.text };
            if (part.type === "image_url") return { inlineData: dataUrlToInlineData(part.image_url.url) };
            return { inlineData: dataUrlToInlineData(part.file.file_data) };
          });

    contents.push({ role, parts });
  }

  return {
    ...(systemChunks.length ? { systemInstruction: { parts: [{ text: systemChunks.join("\n\n") }] } } : {}),
    contents,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callLlm({ model, messages, json }: CallOptions): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new LlmError(
      401,
      "Chave da IA (GEMINI_API_KEY) não configurada no servidor. Gere uma em Google AI Studio e defina a variável de ambiente no seu provedor de deploy.",
    );
  }

  const { systemInstruction, contents } = toGeminiRequest(messages);
  const modelId = model ?? MODELS.reasoning;

  const body: Record<string, unknown> = {
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  };

  const MAX_ATTEMPTS = 3;
  let lastError: LlmError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${GEMINI_BASE_URL}/${modelId}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        promptFeedback?: { blockReason?: string };
      };

      if (!data.candidates?.length && data.promptFeedback?.blockReason) {
        throw new LlmError(400, `Conteúdo bloqueado pela API do Gemini (${data.promptFeedback.blockReason}).`);
      }

      return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    }

    const detail = await res.text().catch(() => "");
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      message = parsed.error?.message ?? detail;
    } catch {
      /* texto puro */
    }

    // 429 (limite) e 503 (modelo sobrecarregado no lado do Google) são transitórios: tenta de novo com backoff.
    const isTransient = res.status === 429 || res.status === 503;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      lastError =
        res.status === 429
          ? new LlmError(429, "Limite gratuito do Gemini atingido no momento.")
          : new LlmError(503, "Modelo do Gemini com alta demanda no momento (instabilidade do lado do Google).");
      await sleep(600 * attempt + Math.floor(Math.random() * 300));
      continue;
    }

    if (res.status === 429) {
      throw new LlmError(429, "Limite gratuito do Gemini atingido no momento. Aguarde alguns segundos e tente novamente.");
    }
    if (res.status === 503) {
      throw new LlmError(
        503,
        "O modelo do Gemini está com alta demanda no momento (instabilidade temporária do lado do Google, não é um problema de configuração). Tente novamente em instantes.",
      );
    }
    if (res.status === 403 || res.status === 401) {
      throw new LlmError(res.status, message || "Chave GEMINI_API_KEY inválida ou sem permissão.");
    }
    throw new LlmError(res.status, message || `Falha na chamada de IA (${res.status}).`);
  }

  // Só chega aqui se todas as tentativas caíram em erro transitório.
  throw (
    lastError ??
    new LlmError(503, "Falha temporária ao chamar a IA. Tente novamente em instantes.")
  );
}

/** Extrai o primeiro objeto JSON de uma resposta (tolerante a cercas de código). */
export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("Resposta do modelo não é um JSON válido.");
  }
}
