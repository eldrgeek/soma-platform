export type BillingMode = 'platform_subscription' | 'platform_metered' | 'byok';

export type UsageKind =
  | 'tts_chars'
  | 'llm_input_tokens'
  | 'llm_output_tokens'
  | 'images'
  | 'convai_minutes'
  | 'web_searches';

export interface EntitlementRow {
  id: string;
  billing_mode: BillingMode;
  plan_id: string | null;
  monthly_cap_usd: number | string;
  status: string;
}

export interface StudioUsageMtdRow {
  billable_usd?: number | string;
  cost_usd?: number | string;
  tts_chars?: number | string;
  llm_tokens?: number | string;
}

export interface MeterStore {
  resolveBillingSubject: (userId: string, requested?: string) => Promise<string | null>;
  resolveStudioId?: (userId: string, requested?: string) => Promise<string | null>;
  resolveEntitlement: (studioId: string) => Promise<EntitlementRow | null>;
  monthToDateBillable: (studioId: string) => Promise<number>;
  insertUsageEvent: (row: Record<string, unknown>) => Promise<void>;
  studioUsageMtd?: (studioId: string) => Promise<StudioUsageMtdRow>;
}

export interface MeterUser {
  id: string;
  actingFor?: string;
  email?: string | null;
  token?: string;
}

export interface SpendContext {
  studioId: string;
  subscriberId: string;
  entitlementId: string | null;
  billingMode: BillingMode;
  planId: string | null;
  capUsd: number;
  mtdUsd: number;
  degraded: boolean;
}

export interface GateSpendOptions {
  capabilityId: string;
  estimatedUsd: number;
  studioId?: string;
}

export interface RecordUsageInput {
  capabilityId: string;
  kind: UsageKind;
  provider: string;
  amount: number;
  ref?: string;
  model?: string;
}

export interface UsageSummary {
  studio_id: string;
  plan_id: string | null;
  billing_mode: BillingMode;
  status: string;
  cap_usd: number;
  mtd_usd: number;
  remaining_usd: number;
  blocked: boolean;
  tts_chars: number;
  llm_tokens: number;
}

export interface Meter {
  gateSpend: (user: MeterUser, opts: GateSpendOptions) => Promise<SpendContext>;
  gateSpendForUserId: (userId: string, opts: GateSpendOptions) => Promise<SpendContext>;
  recordUsage: (ctx: SpendContext, usage: RecordUsageInput) => Promise<void>;
  usageSummary: (user: MeterUser, studioId?: string) => Promise<UsageSummary | null>;
  hasActiveEntitlement: (user: MeterUser, studioId?: string) => Promise<boolean>;
}

export class CapError extends Error {
  constructor(mtdUsd: number, capUsd: number, estimatedUsd: number);
  status: number;
  payload: {
    error: string;
    code: string;
    mtd_usd: number;
    cap_usd: number;
    estimated_usd: number;
  };
}

export function decideSpend(input: {
  mtdUsd: number;
  capUsd: number;
  estimatedUsd: number;
  billingMode: BillingMode;
  status: string;
}): { allowed: boolean; reason?: string };

export declare const USAGE_KINDS: readonly UsageKind[];

export declare const PRICING: {
  tts_per_1k_chars: number;
  llm_input_per_mtok: number;
  llm_output_per_mtok: number;
  image_per_image: number;
  convai_per_minute: number;
  web_search_per_search: number;
};

export function costUsd(kind: UsageKind, amount: number, model?: string): number;
export function estimateTtsUsd(chars: number): number;
export function estimateConvaiUsd(maxDurationSeconds: number): number;
export function estimateLlmUsd(
  inputChars: number,
  maxOutputTokens: number,
  model?: string,
): number;
export function estimateWebSearchUsd(maxUses: number): number;

export function billingUserId(user: { id: string; actingFor?: string }): string;
export function normalizeStore(store: MeterStore | Record<string, unknown>): MeterStore;
export function createMeter(options: {
  store: MeterStore | null;
  app?: string;
  log?: Pick<Console, 'error'>;
}): Meter;

export function createSupabaseRestStore(options: {
  url: string;
  serviceKey: string;
  fetch?: typeof fetch;
  ensureEntitlementRpc?: string;
}): MeterStore;
