/**
 * T45 — Intent Extractor (Tier 3, rule-based, NO ML).
 *
 * Parses an inbound message body and extracts:
 *   - product line items (productId, qty, confidence) by fuzzy substring
 *     match against ProductTemplate.{nameAr, name1, name2, name3, generatedFullName}
 *   - customer phone (Iraqi format: +9647[5-9]NNNNNNN or 07[5-9]NNNNNNN)
 *   - overall confidence ([0..1]) — average of matched-line confidences
 *
 * Fuzzy match rule: a product is considered a match if its searchable text
 * contains any token of length ≥ 3 from the message that also matches a
 * product field, with normalized similarity ≥ 0.7. We use a cheap
 * trigram-based Jaccard similarity to avoid pulling new deps.
 *
 * F5: Tier 3 only. ML upgrade is explicitly out of scope here.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../platform/prisma/prisma.service';

export interface ExtractedItem {
  productId: string;
  qty: number;
  confidence: number;
  matchedText: string;
}

export interface ExtractedIntent {
  items: ExtractedItem[];
  customerPhone: string | null;
  confidence: number;
}

interface ProductRow {
  id: string;
  nameAr: string;
  name1: string;
  name2: string | null;
  name3: string | null;
  generatedFullName: string;
}

const QTY_UNIT_PATTERNS: RegExp[] = [
  /(\d+(?:[.,]\d+)?)\s*(?:قطعة|قطع|حبة|حبات|علبة|علب|كرتون|كراتين|كيلو|كغ|kg|g|gm|pcs?|pieces?)/giu,
  /(?:عدد|count)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/giu,
];

// Iraqi mobile: +9647[3-9]xxxxxxxx, 009647…, 07[3-9]xxxxxxxx, with optional separators.
const IRAQI_PHONE = /(?:\+?964|00964|0)\s*7[3-9](?:[\s-]?\d){8}/u;

function normalize(s: string): string {
  return s
    .replace(/[ً-ْٰ]/g, '') // diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function trigrams(s: string): Set<string> {
  const t = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

@Injectable()
export class IntentExtractorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract a structured intent from a free-text message body for the given
   * company. Looks at the company's active product templates.
   */
  async extract(companyId: string, body: string): Promise<ExtractedIntent> {
    const phone = this.extractPhone(body);
    const qty = this.extractQty(body);

    const products = (await this.prisma.productTemplate.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, nameAr: true, name1: true, name2: true, name3: true, generatedFullName: true },
      take: 2000,
    })) as ProductRow[];

    const norm = normalize(body);
    const bodyGrams = trigrams(norm);

    const scored: Array<{ productId: string; score: number; matchedText: string }> = [];
    for (const p of products) {
      const candidates = [p.nameAr, p.name1, p.name2, p.name3, p.generatedFullName].filter(
        (x): x is string => !!x && x.trim().length >= 2,
      );
      let best = 0;
      let bestText = '';
      for (const c of candidates) {
        const nc = normalize(c);
        if (nc.length < 3) continue;
        // Fast path: substring containment → high score.
        const contained = nc.length >= 3 && norm.includes(nc);
        const sim = contained ? Math.max(0.85, jaccard(trigrams(nc), bodyGrams)) : jaccard(trigrams(nc), bodyGrams);
        if (sim > best) {
          best = sim;
          bestText = c;
        }
      }
      if (best >= 0.7) scored.push({ productId: p.id, score: best, matchedText: bestText });
    }

    // Deduplicate by productId, keep highest score; cap at top 5 lines.
    const byId = new Map<string, { productId: string; score: number; matchedText: string }>();
    for (const s of scored) {
      const prev = byId.get(s.productId);
      if (!prev || s.score > prev.score) byId.set(s.productId, s);
    }
    const top = Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const items: ExtractedItem[] = top.map((s) => ({
      productId: s.productId,
      qty,
      confidence: Number(s.score.toFixed(3)),
      matchedText: s.matchedText,
    }));

    const lineConf = items.length === 0 ? 0 : items.reduce((a, b) => a + b.confidence, 0) / items.length;
    const phoneBoost = phone ? 0.1 : 0;
    const confidence = Math.min(1, Math.max(0, lineConf + phoneBoost));

    return { items, customerPhone: phone, confidence };
  }

  private extractPhone(body: string): string | null {
    const m = IRAQI_PHONE.exec(body);
    if (!m) return null;
    const digits = m[0].replace(/[^\d+]/g, '');
    if (digits.startsWith('+964')) return digits;
    if (digits.startsWith('00964')) return `+${digits.slice(2)}`;
    if (digits.startsWith('964')) return `+${digits}`;
    if (digits.startsWith('0')) return `+964${digits.slice(1)}`;
    return digits;
  }

  private extractQty(body: string): number {
    for (const re of QTY_UNIT_PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(body);
      if (m) {
        const n = parseFloat(m[1].replace(',', '.'));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return 1;
  }
}
