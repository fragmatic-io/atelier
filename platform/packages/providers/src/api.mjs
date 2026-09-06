// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
import { requestJson, ProviderError } from './http.mjs';
import { validateOutput, parseOutput, checkSchema } from './schema.mjs';
export const API_KINDS = ['openai', 'anthropic', 'gemini', 'openai-compatible'];
export const DEFAULT_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
];
function outputText(payload) {
  if (payload.status === 'incomplete')
    throw new ProviderError('OUTPUT_INCOMPLETE', 'Provider stopped before completing its output', {
      sent: true,
    });
  const parts = (payload.output ?? []).flatMap((x) => x.content ?? []);
  if (parts.some((x) => x.type === 'refusal'))
    throw new ProviderError('MODEL_REFUSAL', 'The model declined this request', { sent: true });
  return (
    parts
      .filter((x) => x.type === 'output_text')
      .map((x) => x.text)
      .join('') || payload.output_text
  );
}
export class ApiProvider {
  constructor({
    kind,
    key,
    model,
    baseUrl,
    allowedHosts = DEFAULT_HOSTS,
    request = requestJson,
    timeoutMs = 90000,
    maxOutputTokens = 5000,
  }) {
    if (!API_KINDS.includes(kind))
      throw new ProviderError('UNSUPPORTED_PROVIDER', 'Unsupported API provider');
    if (!key || !model)
      throw new ProviderError('PROVIDER_NOT_CONFIGURED', 'API key and model are required');
    if (model === 'offline-fixture' || key === 'offline-fixture-not-a-real-key')
      throw new ProviderError(
        'DEMO_PROVIDER_ONLY',
        'The offline fixture runs only in the explicit agent demo worker. Configure a live provider.',
      );
    this.id = `${kind}:${model}`;
    Object.assign(this, {
      kind,
      key,
      model,
      baseUrl,
      allowedHosts,
      request,
      timeoutMs,
      maxOutputTokens,
    });
  }
  async generate({
    system,
    input,
    schema,
    signal,
    maxOutputTokens = this.maxOutputTokens,
    images = [],
  }) {
    checkSchema(schema);
    if (
      !Array.isArray(images) ||
      images.length > 4 ||
      images.some(
        (i) =>
          !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.dataUrl ?? '') ||
          i.dataUrl.length > 1500000,
      )
    )
      throw new ProviderError(
        'INVALID_IMAGE',
        'Supply at most four bounded PNG/JPEG/WebP data URLs',
      );
    const prompt = JSON.stringify(input);
    let url,
      body,
      headers = {},
      extract,
      usage;
    if (this.kind === 'openai') {
      url = 'https://api.openai.com/v1/responses';
      headers.authorization = `Bearer ${this.key}`;
      const content = [
        { type: 'input_text', text: prompt },
        ...images.map((i) => ({ type: 'input_image', image_url: i.dataUrl, detail: 'low' })),
      ];
      body = {
        model: this.model,
        instructions: system,
        input: [{ role: 'user', content }],
        max_output_tokens: maxOutputTokens,
        store: false,
        text: { format: { type: 'json_schema', name: 'atelier_artifact', strict: true, schema } },
      };
      extract = outputText;
      usage = (p) => ({ inputTokens: p.usage?.input_tokens, outputTokens: p.usage?.output_tokens });
    } else if (this.kind === 'openai-compatible') {
      if (!this.baseUrl)
        throw new ProviderError(
          'PROVIDER_NOT_CONFIGURED',
          'An operator-approved compatibility endpoint is required',
        );
      url = this.baseUrl.replace(/\/$/, '') + '/chat/completions';
      headers.authorization = `Bearer ${this.key}`;
      body = {
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: images.length
              ? [
                  { type: 'text', text: prompt },
                  ...images.map((i) => ({ type: 'image_url', image_url: { url: i.dataUrl } })),
                ]
              : prompt,
          },
        ],
        max_tokens: maxOutputTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'atelier_artifact', strict: true, schema },
        },
      };
      extract = (p) => {
        if (p.choices?.[0]?.finish_reason === 'length')
          throw new ProviderError('OUTPUT_INCOMPLETE', 'Model output reached its token limit', {
            sent: true,
          });
        return p.choices?.[0]?.message?.content;
      };
      usage = (p) => ({
        inputTokens: p.usage?.prompt_tokens,
        outputTokens: p.usage?.completion_tokens,
      });
    } else if (this.kind === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key': this.key, 'anthropic-version': '2023-06-01' };
      const content = [
        { type: 'text', text: prompt },
        ...images.map((i) => {
          const [, media, data] = /^data:([^;]+);base64,(.+)$/.exec(i.dataUrl) ?? [];
          if (!data) throw new ProviderError('INVALID_IMAGE', 'Expected a base64 image');
          return { type: 'image', source: { type: 'base64', media_type: media, data } };
        }),
      ];
      body = {
        model: this.model,
        system,
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content }],
        tools: [
          {
            name: 'emit_artifact',
            description:
              'Return the requested Atelier artifact. This tool only returns structured data.',
            input_schema: schema,
          },
        ],
        tool_choice: { type: 'tool', name: 'emit_artifact' },
      };
      extract = (p) => {
        if (p.stop_reason === 'max_tokens')
          throw new ProviderError('OUTPUT_INCOMPLETE', 'Model output reached its token limit', {
            sent: true,
          });
        const result = p.content?.find((x) => x.type === 'tool_use' && x.name === 'emit_artifact');
        if (!result)
          throw new ProviderError('MODEL_REFUSAL', 'No structured artifact was returned', {
            sent: true,
          });
        return result.input;
      };
      usage = (p) => ({
        inputTokens:
          p.usage?.input_tokens === undefined
            ? undefined
            : p.usage.input_tokens +
              (p.usage.cache_read_input_tokens ?? 0) +
              (p.usage.cache_creation_input_tokens ?? 0),
        outputTokens: p.usage?.output_tokens,
      });
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
      headers = { 'x-goog-api-key': this.key };
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              ...images.map((i) => {
                const [, mimeType, data] = /^data:([^;]+);base64,(.+)$/.exec(i.dataUrl) ?? [];
                return { inlineData: { mimeType, data } };
              }),
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
        },
      };
      extract = (p) => {
        if (p.candidates?.[0]?.finishReason !== 'STOP')
          throw new ProviderError('OUTPUT_INCOMPLETE', 'Gemini did not complete the artifact', {
            sent: true,
          });
        return p.candidates[0].content?.parts?.map((x) => x.text ?? '').join('');
      };
      usage = (p) => ({
        inputTokens: p.usageMetadata?.promptTokenCount,
        outputTokens: p.usageMetadata?.candidatesTokenCount,
      });
    }
    const start = Date.now();
    const payload = await this.request(url, {
      body,
      headers,
      allowedHosts: this.allowedHosts,
      timeoutMs: this.timeoutMs,
      signal,
    });
    const result = extract(payload);
    if (result === undefined)
      throw new ProviderError('INVALID_RESPONSE', 'Provider response did not contain an artifact', {
        sent: true,
      });
    const value =
      typeof result === 'string' ? parseOutput(result, schema) : validateOutput(result, schema);
    return {
      value,
      usage: usage(payload),
      provider: this.kind,
      model: this.model,
      durationMs: Date.now() - start,
    };
  }
  async completeJson(request) {
    return (await this.generate(request)).value;
  }
}
