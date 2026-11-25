// Provider adapters for the AI core. Anthropic is the default; add others by implementing CallModel.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { repairSuffix, type CallModel } from './aiCore.ts';

export function anthropicProvider(apiKey: string, model: string): CallModel {
  const client = new Anthropic({ apiKey });
  return async (call) => {
    const user = call.user + (call.repairOf ? repairSuffix(call.repairOf) : '');
    // Refusal fallbacks are enabled ("default" routing) so a declined request is retried server-side.
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: call.schema } },
      system: call.system,
      ...(call.webSearch
        ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }] }
        : {}),
      messages: [{ role: 'user', content: user }],
    } as never);
    const msg = response as unknown as {
      model: string;
      stop_reason: string;
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    if (msg.stop_reason === 'refusal') throw new Error('The model declined this request.');
    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return {
      text,
      model: msg.model,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
    };
  };
}

export function getProvider(): CallModel {
  const provider = (Deno.env.get('AI_PROVIDER') ?? 'anthropic').toLowerCase();
  const model = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5';
  if (provider === 'anthropic') {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    return anthropicProvider(key, model);
  }
  throw new Error(`Unsupported AI_PROVIDER "${provider}"`);
}
