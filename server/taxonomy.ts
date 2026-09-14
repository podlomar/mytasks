import { readFileSync } from "node:fs";

export interface Subcategory {
  key: string;
  /** Readable name, e.g. "grocery" for "gro". */
  name: string;
  description: string;
}

export interface Category {
  key: string;
  description: string;
  subcategories: Subcategory[];
}

/**
 * Top-level categories from tasking.json, in file order, each with its
 * subcategories. The extension parses the same file the same way in impl.js.
 */
export function loadTaxonomy(path: string): Category[] {
  const { taxonomy } = JSON.parse(readFileSync(path, "utf8"));
  return Object.entries<any>(taxonomy).map(([key, def]) => ({
    key,
    description: def.description ?? "",
    subcategories: Object.entries<any>(def.subcategories ?? {}).map(([subKey, sub]) => ({
      key: subKey,
      name: sub.name ?? subKey,
      description: sub.description ?? "",
    })),
  }));
}
