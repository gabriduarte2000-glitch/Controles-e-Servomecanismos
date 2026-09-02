/**
 * LLMProvider — única camada de acesso ao modelo de linguagem.
 * Trocar de provedor/modelo no futuro exige mudar apenas este arquivo.
 * Usa o Lovable AI Gateway (sem chaves nem contas externas).
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const MODELS = {
  /** Leitura multimodal (imagem/PDF) e classificação — barato. */
  fast: "google/gemini-3.1-flash-lite",
  /** Resolução matemática e verificação — raciocínio. */
  reasoning: "google/gemini-3.7-flash",
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

export async function callLlm({ model, messages, json }: CallOptions): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new LlmError(401, "Chave de IA não configurada no servidor.");
  }

  const body: Record<string, unknown> = {
    model: model ?? MODELS.reasoning,
    messages,
  };
  if (json) body["response_format"] = { type: "json_object" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = detail;
    try {
      const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message ?? parsed.message ?? detail;
    } catch {
      /* texto puro */
    }
    if (res.status === 429) {
      throw new LlmError(429, "Muitas solicitações no momento. Aguarde alguns segundos e tente novamente.");
    }
    if (res.status === 402) {
      throw new LlmError(402, message || "Créditos de IA esgotados no workspace.");
    }
    if (res.status === 403) {
      throw new LlmError(403, message || "Uso de IA bloqueado pela política do workspace.");
    }
    throw new LlmError(res.status, message || `Falha na chamada de IA (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
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
