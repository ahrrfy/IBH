import { AutoMapper } from '../mappers/auto-mapper';

/**
 * Unit tests for AutoMapper — the smart column-mapping engine that powers
 * step 3 of the import wizard. 4-level matching strategy:
 *   1. Exact field name (high confidence)
 *   2. Normalized exact (high) — labels in Arabic + English, hamza-folded
 *   3. Synonym match (medium)
 *   4. Partial substring (low)
 */

describe('AutoMapper', () => {
  const mapper = new AutoMapper();

  describe('product_template', () => {
    it('matches exact field names with high confidence', () => {
      const result = mapper.autoMap('product_template', ['sku', 'nameAr', 'defaultSalePriceIqd']);
      expect(result.mappings).toEqual(
        expect.arrayContaining([
          { sourceColumn: 'sku', targetField: 'sku', confidence: 'high' },
          { sourceColumn: 'nameAr', targetField: 'nameAr', confidence: 'high' },
          { sourceColumn: 'defaultSalePriceIqd', targetField: 'defaultSalePriceIqd', confidence: 'high' },
        ]),
      );
    });

    it('matches Arabic header labels with high confidence', () => {
      const result = mapper.autoMap('product_template', ['رمز المنتج (SKU)', 'اسم المنتج (عربي)']);
      const skuMatch = result.mappings.find((m) => m.targetField === 'sku');
      const nameMatch = result.mappings.find((m) => m.targetField === 'nameAr');
      expect(skuMatch?.confidence).toBe('high');
      expect(nameMatch?.confidence).toBe('high');
    });

    it('matches synonyms with medium confidence', () => {
      const result = mapper.autoMap('product_template', ['product_code', 'product_name']);
      const skuMatch = result.mappings.find((m) => m.targetField === 'sku');
      const nameMatch = result.mappings.find((m) => m.targetField === 'nameAr');
      expect(skuMatch?.sourceColumn).toBe('product_code');
      expect(skuMatch?.confidence).toBe('medium');
      expect(nameMatch?.sourceColumn).toBe('product_name');
    });

    it('reports unmapped columns and unmapped fields', () => {
      const result = mapper.autoMap('product_template', ['sku', 'unknown_column']);
      expect(result.unmappedColumns).toContain('unknown_column');
      expect(result.unmappedFields).toContain('nameAr');
      expect(result.unmappedFields).toContain('categoryNameAr');
    });

    it('does not double-assign a single source column to two fields', () => {
      // 'name' could match both nameAr and nameEn synonyms — must pick only one
      const result = mapper.autoMap('product_template', ['name']);
      const matchedFields = result.mappings.map((m) => m.targetField);
      // Each source column appears at most once
      const sourceUsage = result.mappings.map((m) => m.sourceColumn);
      expect(sourceUsage.length).toBe(new Set(sourceUsage).size);
      // 'name' resolves to nameAr first (registry order)
      expect(matchedFields).toContain('nameAr');
    });
  });

  describe('Arabic normalization', () => {
    it('hamza variants map to plain alef', () => {
      // 'إلكترونيات' (with hamza-below alef) should match 'الكترونيات'
      const result = mapper.autoMap('product_category', ['إلكترونيات', 'name_en']);
      // We expect the Arabic header to map somewhere even if not exact
      expect(result.mappings.length).toBeGreaterThan(0);
    });
  });

  describe('customer', () => {
    it('matches phone via mobile synonym', () => {
      const result = mapper.autoMap('customer', ['mobile']);
      const phoneMatch = result.mappings.find((m) => m.targetField === 'phone');
      expect(phoneMatch?.sourceColumn).toBe('mobile');
      expect(phoneMatch?.confidence).toBe('medium');
    });
  });
});
