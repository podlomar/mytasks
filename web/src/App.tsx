import { useEffect } from "react";
import type { CategorySummary } from "../../server/types.ts";
import { useApi } from "./api.ts";
import { CategoryPage } from "./CategoryPage.tsx";
import { Overview } from "./Overview.tsx";
import { Link, usePath } from "./router.tsx";

export function App() {
  const path = usePath();
  const { data: categories, error } = useApi<CategorySummary[]>("/api/categories");

  // "/" is the overview; "/buy" is the buy category's page.
  const key = decodeURIComponent(path.split("/")[1] ?? "");
  const current = categories?.find((c) => c.key === key);

  useEffect(() => {
    document.title = key ? `${key} · Tasking` : "Tasking";
    // On a phone the tab row scrolls sideways; keep the active tab in view.
    document.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [key, categories]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          Tasking
        </Link>
        <nav className="tabs" aria-label="Categories">
          {categories?.map((c) => (
            <Link
              key={c.key}
              to={`/${c.key}`}
              className={c.key === key ? "tab active" : "tab"}
              aria-current={c.key === key ? "page" : undefined}
            >
              {c.key}
              <span className="count">{c.count}</span>
            </Link>
          ))}
        </nav>
      </header>

      <main className="content">
        {error ? (
          <p className="error">Could not load categories: {error}</p>
        ) : !key ? (
          categories ? <Overview categories={categories} /> : <p className="muted loading">Loading…</p>
        ) : (
          <CategoryPage key={key} categoryKey={key} summary={current} />
        )}
      </main>
    </div>
  );
}
