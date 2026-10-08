/** Caller-supplied, immutable acceptance oracle. Use synthetic or redacted data. */
export interface SourceQualityScenario {
  id: string;
  name: string;
  data: Record<string, unknown>;
  steps: Array<{ op: 'click' | 'fill' | 'select' | 'press'; selector: string; value?: string }>;
  assertions: Array<{
    kind: 'text' | 'visible' | 'hidden' | 'count' | 'value' | 'disabled' | 'enabled';
    selector: string;
    text?: string;
    value?: string;
    count?: number;
  }>;
  calls: Array<{
    capabilityId: string;
    input: Record<string, unknown>;
    outcome: 'success' | 'error';
    result?: Record<string, unknown>;
    error?: string;
  }>;
}

export interface SourceQualityContract {
  version: 1;
  profile: 'standard' | 'production';
  goal: string;
  dataPolicy: 'synthetic' | 'redacted';
  visualReviewRequired: boolean;
  maxRepairAttempts: number;
  actionIds: string[];
  scenarios: SourceQualityScenario[];
  hash: string;
}

export type SourceQualityInput = Partial<Omit<SourceQualityContract, 'hash' | 'actionIds'>>;
