/* eslint-disable @typescript-eslint/no-explicit-any */
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";

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
            {copy.createCollection}
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
                <th>{copy.description}</th>
                <th>{copy.linkedProducts}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">
                    {copy.emptyCategories}
                  </td>
                </tr>
              ) : (
                collections.map((collection: any) => (
                  <tr key={collection.id}>
                    <td>
                      <div className="admin-table-primary-row">
                        <div className="admin-product-thumb">
                          {getCollectionPrimaryImage(collection) ? (
                            <img src={getCollectionPrimaryImage(collection)} alt={collection.name} />
                          ) : (
                            <span>{collection.name.slice(0, 1) || "C"}</span>
                          )}
                        </div>
                        <div className="admin-table-primary">
                          <strong>{collection.name || copy.collections}</strong>
                          <small>
                            #{collection.id}
                            {isSystemCollection(collection) ? ` • ${copy.categorySystemNote}` : ""}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-description">{collection.description || "-"}</div>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
