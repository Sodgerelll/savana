import type { JSX } from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";
import { buildCategoryTree } from "../../lib/storefrontHelpers";
import type { CategoryTreeNode } from "../../lib/storefrontHelpers";

export default function CategoriesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    collections,
    activeCollections,
    inactiveCollectionsCount,
    linkedCollectionCount,
    productCountByCategory,
    openCollectionModal,
    handleCollectionDeleteRequest,
    getCollectionPrimaryImage,
    isSystemCollection,
    setActiveSection,
  } = ctx;

  const tree = buildCategoryTree(collections);

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: CategoryTreeNode, parentCollapsed: boolean): JSX.Element[] {
    const { collection, code, children } = node;
    const level = collection.level ?? 1;
    const isCollapsed = collapsed.has(collection.id);
    const hasChildren = children.length > 0;

    const levelLabel =
      level === 1 ? copy.categoryLevelGroup :
      level === 2 ? copy.categoryLevelCategory :
      copy.categoryLevelType;

    const addChildLabel =
      level === 1 ? copy.addCategoryChild :
      level === 2 ? copy.addTypeChild : null;

    const indent = level === 1 ? 0 : level === 2 ? 24 : 48;

    const rows: JSX.Element[] = [];

    if (!parentCollapsed) {
      rows.push(
        <tr key={collection.id} data-level={level}>
          <td style={{ paddingLeft: indent }}>
            <div className="admin-table-primary-row">
              <button
                type="button"
                onClick={() => hasChildren && toggle(collection.id)}
                style={{
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: hasChildren ? "pointer" : "default",
                  opacity: hasChildren ? 1 : 0,
                  color: "var(--admin-muted, #888)",
                }}
                aria-label={isCollapsed ? "Нээх" : "Хаах"}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <div
                className="admin-product-thumb"
                style={{
                  width: level === 1 ? 34 : level === 2 ? 28 : 24,
                  height: level === 1 ? 34 : level === 2 ? 28 : 24,
                  fontSize: level === 1 ? undefined : "0.7em",
                  flexShrink: 0,
                }}
              >
                {getCollectionPrimaryImage(collection) ? (
                  <img src={getCollectionPrimaryImage(collection)} alt={collection.name} />
                ) : (
                  <span>{collection.name.slice(0, 1).toUpperCase() || "C"}</span>
                )}
              </div>
              <div className="admin-table-primary">
                <strong style={{ fontSize: level === 1 ? "0.95em" : level === 2 ? "0.88em" : "0.83em" }}>
                  <span style={{ opacity: 0.4, marginRight: 6, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>{code}</span>
                  {collection.name || copy.collections}
                </strong>
                <small style={{ opacity: 0.5 }}>
                  {levelLabel}
                  {hasChildren && (
                    <span style={{ marginLeft: 6 }}>
                      · {children.length}
                    </span>
                  )}
                  {isSystemCollection(collection) ? ` · ${copy.categorySystemNote}` : ""}
                </small>
              </div>
            </div>
          </td>
          <td>{productCountByCategory.get(collection.slug) ?? 0}</td>
          <td>
            <StatusBadge
              status={collection.status}
              activeLabel={copy.active}
              inactiveLabel={copy.inactive}
            />
          </td>
          <td>
            <div className="admin-table-actions">
              {addChildLabel && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => openCollectionModal(undefined, collection)}
                >
                  <Plus size={13} />
                  {addChildLabel}
                </button>
              )}
              <button
                type="button"
                className="admin-icon-btn admin-icon-btn-neutral"
                onClick={() => openCollectionModal(collection)}
                aria-label={`${copy.edit} ${collection.name}`}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="admin-icon-btn"
                onClick={() => handleCollectionDeleteRequest(collection)}
                aria-label={`${copy.delete} ${collection.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </td>
        </tr>
      );
    }

    for (const child of children) {
      rows.push(...renderNode(child, parentCollapsed || isCollapsed));
    }

    return rows;
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.collections}</p>
          <h1>{copy.categoriesTitle}</h1>
          <p>{copy.categoriesText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-outline" onClick={() => setActiveSection("products")}>
            <Package size={16} />
            {copy.openProducts}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openCollectionModal()}>
            <Plus size={16} />
            {copy.addGroup}
          </button>
        </div>
      </div>

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{copy.totalCollections}</span>
          <strong>{collections.length}</strong>
          <small>{copy.categorySummary}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.activeCount}</span>
          <strong>{activeCollections.length}</strong>
          <small>{copy.activeOnWebsite}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.inactiveCount}</span>
          <strong>{inactiveCollectionsCount}</strong>
          <small>{copy.statusSummary}</small>
        </div>
        <div className="admin-summary-card">
          <span>{copy.linkedProducts}</span>
          <strong>{linkedCollectionCount}</strong>
          <small>{copy.categoryDependencyError}</small>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.collections}</h2>
            <p>{copy.categorySummary}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.name}</th>
                <th>{copy.linkedProducts}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">
                    {copy.emptyCategories}
                  </td>
                </tr>
              ) : (
                tree.flatMap((node) => renderNode(node, false))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
