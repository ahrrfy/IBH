import { Injectable } from '@nestjs/common';
import { ENTITY_FIELD_REGISTRY, type FieldDefinition } from './entity-field-registry';
import type { ImportableEntityType } from '../dto/data-migration.dto';

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AutoMapResult {
  mappings: ColumnMapping[];
  unmappedColumns: string[];
  unmappedFields: string[];
}

@Injectable()
export class AutoMapper {
  autoMap(entityType: ImportableEntityType, sourceColumns: string[]): AutoMapResult {
    const fields = ENTITY_FIELD_REGISTRY[entityType];
    if (!fields) {
      return { mappings: [], unmappedColumns: [...sourceColumns], unmappedFields: [] };
    }

    const mappings: ColumnMapping[] = [];
    const usedColumns = new Set<string>();
    const usedFields = new Set<string>();

    for (const field of fields) {
      const match = this.findBestMatch(field, sourceColumns, usedColumns);
      if (match) {
        mappings.push(match);
        usedColumns.add(match.sourceColumn);
        usedFields.add(field.field);
      }
    }

    return {
      mappings,
      unmappedColumns: sourceColumns.filter((c) => !usedColumns.has(c)),
      unmappedFields: fields.filter((f) => !usedFields.has(f.field)).map((f) => f.field),
    };
  }

  private findBestMatch(
    field: FieldDefinition,
    columns: string[],
    used: Set<string>,
  ): ColumnMapping | null {
    const available = columns.filter((c) => !used.has(c));

    // Level 1: exact field name
    for (const col of available) {
      if (col === field.field) {
        return { sourceColumn: col, targetField: field.field, confidence: 'high' };
      }
    }

    // Level 2: normalized exact (against field name + Arabic/English labels)
    const normField = this.normalize(field.field);
    const normLabelAr = this.normalize(field.labelAr);
    const normLabelEn = this.normalize(field.labelEn);

    for (const col of available) {
      const normCol = this.normalize(col);
      if (normCol === normField || normCol === normLabelAr || normCol === normLabelEn) {
        return { sourceColumn: col, targetField: field.field, confidence: 'high' };
      }
    }

    // Level 3: synonym match
    const normSynonyms = field.synonyms.map((s) => this.normalize(s));
    for (const col of available) {
      const normCol = this.normalize(col);
      if (normSynonyms.includes(normCol)) {
        return { sourceColumn: col, targetField: field.field, confidence: 'medium' };
      }
    }

    // Level 4: partial match
    for (const col of available) {
      const normCol = this.normalize(col);
      if (normCol.length > 2) {
        if (
          normCol.includes(normField) ||
          normField.includes(normCol) ||
          normSynonyms.some((s) => normCol.includes(s) || s.includes(normCol))
        ) {
          return { sourceColumn: col, targetField: field.field, confidence: 'low' };
        }
      }
    }

    return null;
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/[\s_\-()（）]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .trim();
  }
}
