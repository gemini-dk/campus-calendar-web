import {
  type LanguageModelV2,
  type LanguageModelV2Content,
  type LanguageModelV2FinishReason,
  type LanguageModelV2Prompt,
  type LanguageModelV2StreamPart,
  type LanguageModelV2Usage,
} from '@ai-sdk/provider';

import { randomUUID } from 'node:crypto';

const FIREWORKS_ENDPOINT = 'https://api.fireworks.ai/inference/v1/chat/completions';

function mapFinishReason(reason?: string | null): LanguageModelV2FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'tool_calls':
      return 'tool-calls';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

function toUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): LanguageModelV2Usage {
  return {
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
  };
}

function toPlainText(content: LanguageModelV2Prompt[number]['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function mapPrompt(prompt: LanguageModelV2Prompt) {
  return prompt.map((message) => {
    if (message.role === 'system') {
      return {
        role: 'system' as const,
        content: message.content,
      };
    }

    const content = toPlainText(message.content);
    return {
      role: message.role,
      content,
    };
  });
}

async function executeCompletion({
  modelId,
  apiKey,
  options,
}: {
  modelId: string;
  apiKey: string;
  options: Parameters<LanguageModelV2['doGenerate']>[0];
}) {
  const messages = mapPrompt(options.prompt);

  const responseFormat =
    options.responseFormat?.type === 'json'
      ? {
          type: 'json_object',
          schema: options.responseFormat.schema,
          name: options.responseFormat.name,
          description: options.responseFormat.description,
        }
      : undefined;

  const requestBody = {
    model: modelId,
    messages,
    temperature: options.temperature,
    top_p: options.topP,
    top_k: options.topK,
    max_tokens: options.maxOutputTokens,
    stop: options.stopSequences,
    response_format: responseFormat,
  };

  const response = await fetch(FIREWORKS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options.headers,
    },
    body: JSON.stringify(requestBody),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fireworks API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{
      message?: { content?: string | null };
      finish_reason?: string | null;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const contentText = data.choices[0]?.message?.content ?? '';

  return {
    content: contentText,
    finishReason: mapFinishReason(data.choices[0]?.finish_reason),
    usage: toUsage(data.usage),
    requestBody,
    responseHeaders: Object.fromEntries(response.headers.entries()),
  };
}

export function createFireworksModel(modelId: string, apiKey: string): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'fireworks',
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      const result = await executeCompletion({ modelId, apiKey, options });

      const content: LanguageModelV2Content[] = [
        {
          type: 'text',
          text: result.content,
        },
      ];

      return {
        content,
        finishReason: result.finishReason,
        usage: result.usage,
        providerMetadata: undefined,
        warnings: [],
        request: { body: result.requestBody },
        response: { headers: result.responseHeaders },
      };
    },
    async doStream(options) {
      const result = await executeCompletion({ modelId, apiKey, options });
      const streamId = randomUUID();

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: streamId });
          if (result.content) {
            controller.enqueue({ type: 'text-delta', id: streamId, delta: result.content });
          }
          controller.enqueue({ type: 'text-end', id: streamId });
          controller.enqueue({
            type: 'finish',
            usage: result.usage,
            finishReason: result.finishReason,
          });
          controller.close();
        },
      });

      return {
        stream,
        request: { body: result.requestBody },
        response: { headers: result.responseHeaders },
      };
    },
  };
}
