import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnomalyDetectionService } from './anomaly-detection.service';

@Injectable()
export class AiService {
  constructor(private config: ConfigService, private anomalies: AnomalyDetectionService) {}

  private get brainUrl(): string | undefined {
    return this.config.get<string>('AI_BRAIN_URL');
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>('AI_BRAIN_API_KEY');
  }

  private async callBrain(path: string, body?: any, method: 'GET' | 'POST' = 'POST'): Promise<any> {
    if (!this.brainUrl) return { available: false, message: 'AI service unavailable' };
    try {
      const res = await fetch(`${this.brainUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) return { available: false, message: `AI error ${res.status}` };
      return await res.json();
    } catch {
      return { available: false, message: 'AI service unavailable' };
    }
  }

  async healthCheck() {
    if (!this.brainUrl) return { available: false, message: 'AI_BRAIN_URL not configured' };
    const result = await this.callBrain('/health', undefined, 'GET');
    return { available: result.available !== false, ...result };
  }

  async explainAnomaly(anomalyData: any) {
    if (!this.brainUrl) {
      return { available: false, explanation: 'AI غير متاح - عرض البيانات الخام', data: anomalyData };
    }
    return this.callBrain('/explain-anomaly', { anomaly: anomalyData });
  }

  async copilotSuggest(context: { screen: string; entityType?: string; entityData?: any }) {
    if (!this.brainUrl) {
      return { available: false, tier: 3, suggestions: [] };
    }
    const result = await this.callBrain('/copilot', context);
    if (result.available === false) return { available: false, tier: 3, suggestions: [] };
    return { available: true, tier: 1, suggestions: result.suggestions ?? [] };
  }
}
