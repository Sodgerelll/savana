/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";

export default function FactoryRecipesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    products,
    collections,
    collectionNameBySlug,
    productionRecipes,
    productionRecipeError,
    setProductionRecipeError,
    setProductionRecipeModal,
    openConfirmModal,
    deleteProductionRecipe,
  } = ctx;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const productById = new Map<number, any>((products as any[]).map((p) => [p.id, p]));

  /** Categories fall back to the value stored on the recipe if the product moved/was removed. */
  const categoryOf = (recipe: any): string =>
    productById.get(recipe.productId)?.category ?? recipe.category ?? "";

  const categoryLabel = (slug: string): string =>
    collectionNameBySlug?.get(slug) ?? slug ?? "—";

  const recipes: any[] = productionRecipes ?? [];

  const filtered = recipes.filter((recipe) => {
    if (filterCategory && categoryOf(recipe) !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = (productById.get(recipe.productId)?.name ?? recipe.productName ?? "").toLowerCase();
      const variant = (recipe.variantName ?? "").toLowerCase();
      if (!name.includes(q) && !variant.includes(q)) return false;
    }
    return true;
  });

  const productsWithRecipe = new Set(recipes.map((r) => r.productId));
  const missingCount = (products as any[]).filter((p) => !productsWithRecipe.has(p.id)).length;

  const openCreateModal = () => {
    setProductionRecipeError(null);
    const firstProduct = (products as any[])[0];
    if (!firstProduct) {
      setProductionRecipeError(copy.recipeNoProducts);
      return;
    }
    setProductionRecipeModal({
      mode: "create",
      draft: {
        id: "",
        productId: firstProduct.id,
        productName: firstProduct.name,
        category: firstProduct.category ?? "",
        variantName: firstProduct.variants?.[0]?.name ?? null,
        baseQuantity: 1,
        supplies: [],
        totalCost: 0,
        notes: "",
      },
    });
  };

  const openEditModal = (recipe: any) => {
    setProductionRecipeError(null);
    setProductionRecipeModal({
      mode: "edit",
      previous: recipe,
      draft: {
        id: recipe.id,
        productId: recipe.productId,
        productName: recipe.productName,
        category: categoryOf(recipe),
        variantName: recipe.variantName,
        baseQuantity: recipe.baseQuantity,
        supplies: recipe.supplies.map((s: any) => ({ ...s })),
        totalCost: recipe.totalCost,
        notes: recipe.notes,
      },
    });
  };

  const suppliesCost = (supplies: any[]) =>
    supplies.reduce((sum: number, s: any) => (s.unitCost != null ? sum + s.quantity * s.unitCost : sum), 0);

  const categoryOptions = ((collections ?? []) as any[]).filter((c) =>
    recipes.some((r) => categoryOf(r) === c.slug),
  );

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.productionKicker}</p>
          <h1>{copy.recipesTitle}</h1>
          <p>{copy.recipesText}</p>
        </div>
      </div>

      {productionRecipeError && <div className="admin-alert admin-alert-danger">{productionRecipeError}</div>}

      <div className="admin-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card"><span>{copy.recipesCount}</span><strong>{recipes.length}</strong></div>
        <div className="admin-summary-card"><span>{copy.recipesProductsCovered}</span><strong>{productsWithRecipe.size}</strong></div>
        <div className="admin-summary-card">
          <span>{copy.recipesProductsMissing}</span>
          <strong style={{ color: missingCount > 0 ? "#d97706" : undefined }}>{missingCount}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-search">
          <Search size={16} className="admin-filter-search-icon" />
          <input
            type="text"
            placeholder={copy.searchByName}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <SlidersHorizontal size={14} className="admin-filter-group-icon" />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">{copy.allCategories}</option>
            {categoryOptions.map((c: any) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="admin-filter-meta">
          {(search || filterCategory) && (
            <button type="button" className="admin-filter-clear" onClick={() => { setSearch(""); setFilterCategory(""); }}>
              <X size={14} /> {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">{filtered.length} / {recipes.length}</span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.recipesListTitle}</h2>
            <p>{copy.recipesListSummary}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> {copy.recipeModalCreate}
          </button>
        </div>

        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>#</th>
                <th>{copy.recipeCategory}</th>
                <th>{copy.recipeProduct}</th>
                <th>{copy.recipeVariant}</th>
                <th>{copy.recipeBaseQuantity}</th>
                <th>{copy.recipeSupplies}</th>
                <th>{copy.recipeTotalCost}</th>
                <th>{copy.recipeUnitCost}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="admin-table-empty">{copy.recipesEmpty}</td>
                </tr>
              ) : (
                filtered.map((recipe: any, idx: number) => {
                  const isOpen = expandedId === recipe.id;
                  const supplies: any[] = recipe.supplies ?? [];
                  const total = suppliesCost(supplies);
                  const base = recipe.baseQuantity > 0 ? recipe.baseQuantity : 1;
                  const perUnit = total / base;

                  return [
                    <tr
                      key={recipe.id}
                      onClick={() => setExpandedId(isOpen ? null : recipe.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ color: "#9ca3af", paddingRight: 0 }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>{idx + 1}</td>
                      <td>{categoryLabel(categoryOf(recipe))}</td>
                      <td>{getProductLabel(recipe.productId, productById.get(recipe.productId)?.name ?? recipe.productName)}</td>
                      <td>
                        {recipe.variantName ? (
                          <span style={{
                            display: "inline-block",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "999px",
                            background: "#eef2ff",
                            color: "#4338ca",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}>{recipe.variantName}</span>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{copy.recipeVariantAll}</span>
                        )}
                      </td>
                      <td>{recipe.baseQuantity}</td>
                      <td>{supplies.length}</td>
                      <td>{total > 0 ? total.toLocaleString() : "—"}</td>
                      <td>{perUnit > 0 ? Math.round(perUnit).toLocaleString() : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => openEditModal(recipe)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() =>
                              openConfirmModal({
                                title: copy.confirmDeleteTitle,
                                description: copy.deleteRecipeDescription,
                                confirmLabel: copy.delete,
                                destructive: true,
                                onConfirm: () => deleteProductionRecipe(recipe.id),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>,

                    isOpen && (
                      <tr key={`${recipe.id}-expand`}>
                        <td colSpan={10} style={{ padding: 0, background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                          <div style={{ padding: "18px 20px 20px 36px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                              {copy.recipeSupplies}
                            </div>
                            {supplies.length === 0 ? (
                              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>{copy.recipeEmptySupplies}</p>
                            ) : (
                              <table style={{ width: "100%", maxWidth: 720, borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                    <th style={{ textAlign: "left",  padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.rawMaterialName}</th>
                                    <th style={{ textAlign: "right", padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.recipeBaseQuantity}</th>
                                    <th style={{ textAlign: "right", padding: "4px 12px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.rawMaterialUnitCost}</th>
                                    <th style={{ textAlign: "right", padding: "4px 0    6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.recipeTotalCost}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {supplies.map((s: any, si: number) => {
                                    const line = s.unitCost != null ? s.quantity * s.unitCost : null;
                                    return (
                                      <tr key={si} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                        <td style={{ padding: "5px 12px 5px 0", color: "#111827" }}>{s.rawMaterialName}</td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                                          {s.quantity} {s.unit}
                                        </td>
                                        <td style={{ padding: "5px 12px 5px 0", textAlign: "right", color: "#6b7280" }}>
                                          {s.unitCost != null ? s.unitCost.toLocaleString() : "—"}
                                        </td>
                                        <td style={{ padding: "5px 0", textAlign: "right", color: "#374151", fontWeight: 500 }}>
                                          {line !== null ? line.toLocaleString() : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr style={{ borderTop: "1px solid #e5e7eb" }}>
                                    <td colSpan={3} style={{ paddingTop: 8, textAlign: "right", fontWeight: 600, fontSize: 12, color: "#374151" }}>
                                      {copy.recipeTotalCost} ({recipe.baseQuantity} ш):
                                    </td>
                                    <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 700, color: "#111827" }}>
                                      {total > 0 ? total.toLocaleString() : "—"}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            )}

                            {recipe.notes && (
                              <div style={{ marginTop: 14, fontSize: 13, color: "#6b7280", borderTop: "1px solid #e5e7eb", paddingTop: 10, maxWidth: 720 }}>
                                <span style={{ fontWeight: 500, color: "#374151" }}>{copy.recipeNotes}: </span>
                                {recipe.notes}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
