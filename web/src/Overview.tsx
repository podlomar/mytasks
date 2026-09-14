import type { CategorySummary } from "../../server/types.ts";
import { Link } from "./router.tsx";

export function Overview({ categories }: { categories: CategorySummary[] }) {
  return (
    <>
      <header className="page-head">
        <h1>All categories</h1>
      </header>
      <ul className="overview">
        {categories.map((c) => (
          <li key={c.key}>
            <Link to={`/${c.key}`} className="overview-card">
              <div className="overview-title">
                <span>{c.key}</span>
                <span className="count">{c.count}</span>
              </div>
              <p className="muted">{c.description}</p>
              {c.subcategories.length > 0 && (
                <div className="subs">
                  {c.subcategories.map((s) => (
                    <span key={s.key} className={s.count === 0 ? "dim" : undefined}>
                      {s.name} {s.count}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
