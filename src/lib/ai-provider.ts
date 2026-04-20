import { ChatAnthropic } from "@langchain/anthropic";

type ChatModelOptions = {
  temperature: number;
  timeout: number;
  maxRetries: number;
};

type ResolvedAiProvider = {
  apiKey: string;
};

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function resolveAiProvider(): ResolvedAiProvider {
  const anthropicApiKey = readEnv("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  return {
    apiKey: anthropicApiKey,
  };
}

export function createAiChatModel(options: ChatModelOptions) {
  const provider = resolveAiProvider();
  const llm = new ChatAnthropic({
    apiKey: provider.apiKey,
    model: ANTHROPIC_MODEL,
    temperature: options.temperature,
    maxRetries: options.maxRetries,
    clientOptions: {
      timeout: options.timeout,
    },
  });
  return { llm, model: ANTHROPIC_MODEL };
}

export function getAiProviderErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return "Unknown AI provider error";
}
