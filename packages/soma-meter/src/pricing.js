/**
 * @typedef {'tts_chars' | 'llm_input_tokens' | 'llm_output_tokens' | 'images' | 'convai_minutes' | 'web_searches'} UsageKind
 */

/** @type {readonly UsageKind[]} */
export const USAGE_KINDS = [
  'tts_chars',
  'llm_input_tokens',
  'llm_output_tokens',
  'images',
  'convai_minutes',
  'web_searches',
];

export const PRICING = {
  tts_per_1k_chars: 0.22,
  llm_input_per_mtok: 3.0,
  llm_output_per_mtok: 15.0,
  image_per_image: 0.05,
  convai_per_minute: 0.1,
  web_search_per_search: 0.01,
};

const MODEL_RATES = [
  { prefix: 'claude-opus', inPerMtok: 5.0, outPerMtok: 25.0 },
  { prefix: 'claude-sonnet', inPerMtok: 3.0, outPerMtok: 15.0 },
  { prefix: 'claude-haiku', inPerMtok: 1.0, outPerMtok: 5.0 },
];

/**
 * @param {string} [model]
 */
function llmRates(model) {
  if (model) {
    const hit = MODEL_RATES.find((r) => model.startsWith(r.prefix));
    if (hit) return hit;
  }
  return { inPerMtok: PRICING.llm_input_per_mtok, outPerMtok: PRICING.llm_output_per_mtok };
}

/**
 * @param {UsageKind} kind
 * @param {number} amount
 * @param {string} [model]
 */
export function costUsd(kind, amount, model) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  switch (kind) {
    case 'tts_chars':
      return (amount / 1_000) * PRICING.tts_per_1k_chars;
    case 'llm_input_tokens':
      return (amount / 1_000_000) * llmRates(model).inPerMtok;
    case 'llm_output_tokens':
      return (amount / 1_000_000) * llmRates(model).outPerMtok;
    case 'images':
      return amount * PRICING.image_per_image;
    case 'convai_minutes':
      return amount * PRICING.convai_per_minute;
    case 'web_searches':
      return amount * PRICING.web_search_per_search;
    default:
      return 0;
  }
}
