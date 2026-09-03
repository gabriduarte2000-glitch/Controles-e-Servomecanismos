/**
 * LLMProvider — única camada de acesso ao modelo de linguagem.
 * Trocar de provedor/modelo no futuro exige mudar apenas este arquivo.
 *
 * Provedor principal: API do Gemini (Google) direto, com GEMINI_API_KEY.
 * Gere uma chave grátis em https://aistudio.google.com/apikey.
 *
 * Provedor de reserva (fallback automático): Groq — API gratuita, compatível
 * com formato OpenAI, sem cartão de crédito. Crie uma conta em console.groq.com
 * (email ou Google), gere uma chave em console.groq.com/keys e defina
 * GROQ_API_KEY no seu provedor de deploy. Quando o Gemini esgota o limite
 * gratuito (429) ou fica instável (503), o sistema cai para o Groq
 * automaticamente — sem isso configurado, ele só reporta o erro do Gemini.
 * (O GitHub Models, cotado antes, foi desativado pela GitHub em 30/07/2026 —
 * por isso a troca para o Groq.)
 */

import { jsonrepair } from "jsonrepair";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const MODELS = {
  /** Leitura multimodal (imagem/PDF) e classificação — barato/rápido. */
  fast: "gemini-3.5-flash-lite",
  /** Resolução matemática e verificação — raciocínio. */
  reasoning: "gemini-3.5-flash",
} as const;

/** Modelos usados no provedor de reserva (Groq) quando o Gemini falha. */
const FALLBACK_MODELS = {
  /** Multimodal (entende imagem) — usado no lugar de MODELS.fast. */
  fast: "qwen/qwen3.6-27b",
  /** Mais forte para raciocínio — usado no lugar de MODELS.reasoning. */
  reasoning: "openai/gpt-oss-120b",
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrai mimeType e base64 de uma data URL (ex.: "data:image/png;base64,AAAA..."). */
function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    throw new LlmError(400, "Arquivo enviado em formato inesperado (esperado data URL base64).");
  }
  return { mimeType: match[1]!, data: match[2]! };
}

// ───────────────────────────── Gemini (provedor principal) ─────────────────────────────

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

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

async function callGemini({ model, messages, json }: CallOptions, apiKey: string): Promise<string> {
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
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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

    const isTransient = res.status === 429 || res.status === 503;
    if (isTransient && attempt < MAX_ATTEMPTS) {
      lastError =
        res.status === 429
          ? new LlmError(429, "Limite gratuito do Gemini atingido no momento.")
          : new LlmError(503, "Modelo do Gemini com alta demanda no momento (instabilidade do lado do Google).");
      await sleep(600 * attempt + Math.floor(Math.random() * 300));
      continue;
    }

    if (res.status === 429) throw new LlmError(429, "Limite gratuito do Gemini atingido no momento.");
    if (res.status === 503) throw new LlmError(503, "O modelo do Gemini está com alta demanda no momento.");
    if (res.status === 403 || res.status === 401) {
      throw new LlmError(res.status, message || "Chave GEMINI_API_KEY inválida ou sem permissão.");
    }
    throw new LlmError(res.status, message || `Falha na chamada de IA (${res.status}).`);
  }

  throw lastError ?? new LlmError(503, "Falha temporária ao chamar o Gemini.");
}

// ─────────────────────────────── Groq (provedor de reserva) ───────────────────────────────

function toOpenAiMessages(messages: LlmMessage[]): Array<{ role: string; content: unknown }> {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const content = m.content.map((part) => {
      if (part.type === "text") return { type: "text", text: part.text };
      if (part.type === "image_url") return { type: "image_url", image_url: { url: part.image_url.url } };
      return { type: "text", text: `[Arquivo "${part.file.filename}" anexado — não suportado no provedor de reserva.]` };
    });
    return { role: m.role, content };
  });
}

function fallbackModelFor(model: string | undefined): string {
  return model === MODELS.fast ? FALLBACK_MODELS.fast : FALLBACK_MODELS.reasoning;
}

async function callGroq({ model, messages, json }: CallOptions, apiKey: string): Promise<string> {
  const body: Record<string, unknown> = {
    model: fallbackModelFor(model),
    messages: toOpenAiMessages(messages),
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  const MAX_ATTEMPTS = 2;
  let lastError: LlmError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? "";
    }

    const detail = await res.text().catch(() => "");
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string } };
      message = parsed.error?.message ?? detail;
    } catch {
      /* texto puro */
    }

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      lastError = new LlmError(429, "Limite gratuito do Groq atingido no momento.");
      await sleep(800 * attempt);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new LlmError(res.status, "GROQ_API_KEY inválida ou sem permissão.");
    }
    if (res.status === 429) {
      throw new LlmError(429, "Limite gratuito do Groq também atingido no momento. Tente novamente mais tarde.");
    }
    throw new LlmError(res.status, message || `Falha no provedor de reserva Groq (${res.status}).`);
  }

  throw lastError ?? new LlmError(503, "Falha temporária ao chamar o Groq.");
}

// ───────────────────────────────── Ponto único de entrada ─────────────────────────────────

export async function callLlm(opts: CallOptions): Promise<string> {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const groqKey = process.env["GROQ_API_KEY"];

  if (geminiKey) {
    try {
      return await callGemini(opts, geminiKey);
    } catch (error) {
      const isQuotaOrOverload = error instanceof LlmError && (error.status === 429 || error.status === 503);
      if (!isQuotaOrOverload || !groqKey) throw error;
      // Gemini esgotou/instável e há um provedor de reserva configurado: tenta ele antes de desistir.
    }
  }

  if (groqKey) {
    return await callGroq(opts, groqKey);
  }

  if (!geminiKey) {
    throw new LlmError(
      401,
      "Nenhuma chave de IA configurada no servidor. Defina GEMINI_API_KEY (aistudio.google.com/apikey) e, opcionalmente, GROQ_API_KEY como provedor de reserva (console.groq.com/keys).",
    );
  }

  throw new LlmError(
    429,
    "Limite gratuito do Gemini atingido e nenhum provedor de reserva (GROQ_API_KEY) configurado. Aguarde alguns instantes e tente novamente.",
  );
}

/** Extrai o primeiro objeto JSON de uma resposta (tolerante a cercas de código). */
/** Remove problemas comuns de JSON "quase válido" vindo de LLM: vírgula sobrando antes de `}`/`]`. */
function repairJson(s: string): string {
  return s.replace(/,(\s*[}\]])/g, "$1");
}

export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const sliced = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  const attempts = [cleaned, repairJson(cleaned), sliced, repairJson(sliced)];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    return JSON.parse(jsonrepair(sliced)) as T;
  } catch (error) {
    lastError = error;
  }

  throw new Error(
    `Resposta do modelo não é um JSON válido (${lastError instanceof Error ? lastError.message : "erro desconhecido"}).`,
  );
}
