import type { CategorySummary, EntryGroup } from "../../server/types.ts";
import { useApi } from "./api.ts";
import { EntryCard } from "./EntryCard.tsx";

export function CategoryPage({ categoryKey, summary }: { categoryKey: string; summary?: CategorySummary }) {
  const { data, error } = useApi<EntryGroup[]>(
    `/api/categories/${encodeURIComponent(categoryKey)}?group=subcategory`,
  );

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted loading">Loading…</p>;

  const groups = data.filter((g) => g.entries.length > 0);
  const subgroups = groups.filter((g) => g.subcategory !== null);
  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <>
      <header className="page-head">
        <h1>
          {categoryKey} <span className="count">{total}</span>
        </h1>
        {summary?.description && <p className="muted">{summary.description}</p>}
      </header>

      {subgroups.length > 1 && (
        <nav className="jump" aria-label="Subcategories">
          {subgroups.map((g) => (
            <a key={g.subcategory} href={`#${g.subcategory}`}>
              {g.name ?? g.subcategory} <span className="count">{g.entries.length}</span>
            </a>
          ))}
        </nav>
      )}

      {total === 0 && <p className="empty">Nothing in {categoryKey} yet.</p>}

      {/* Entries stored under the category alone come first, without a heading. */}
      {groups.map((g) => (
        <section key={g.subcategory ?? ""} id={g.subcategory ?? undefined} className="group">
          {g.subcategory !== null && (
            <h2>
              {g.name ?? g.subcategory} <span className="count">{g.entries.length}</span>
            </h2>
          )}
          <div className="entries">
            {g.entries.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
