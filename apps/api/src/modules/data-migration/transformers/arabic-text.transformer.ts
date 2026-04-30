import { Injectable } from '@nestjs/common';

@Injectable()
export class ArabicTextTransformer {
  transform(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/ـ/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeForMatching(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return this.transform(text)
      .replace(/[ؐ-ًؚ-ٰٟ]/g, '')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  }
}
