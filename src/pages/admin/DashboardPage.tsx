/* eslint-disable @typescript-eslint/no-explicit-any */
import { Images, MapPin, MessageSquareQuote, Package, Store } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

export default function DashboardPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    activeProducts,
    products,
    orders,
    activeCollections,
    collections,
    activeHeroBanners,
    heroBanners,
    activeMarkets,
    markets,
    activeTestimonials,
    testimonials,
    error,
    loading,
    saving,
    backend,
    structure,
    visibleSettings,
    adminMenuGroups,
    isPrivilegedUser,
    collectionNameBySlug,
    setActiveSection,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.quickOverview}</p>
          <h1>{copy.dashboardTitle}</h1>
          <p>{copy.dashboardText}</p>
        </div>
      </div>

      <div className="admin-stat-grid">
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="website"
          onClick={() => setActiveSection("products")}
          aria-label={copy.openProducts}
        >
          <span>{copy.totalProducts}</span>
          <strong>{activeProducts.length}/{products.length}</strong>
          <small>{copy.statusSummary}</small>
        </button>
        {isPrivilegedUser && (
          <button
            type="button"
            className="admin-stat-card admin-stat-card-link admin-module-card"
            data-module="crm"
            onClick={() => setActiveSection("orders")}
            aria-label={copy.openOrders}
          >
            <span>{copy.totalOrders}</span>
            <strong>{orders.length}</strong>
            <small>{copy.ordersText}</small>
          </button>
        )}
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="website"
          onClick={() => setActiveSection("categories")}
          aria-label={copy.openCategories}
        >
          <span>{copy.totalCollections}</span>
          <strong>{activeCollections.length}/{collections.length}</strong>
          <small>{copy.statusSummary}</small>
        </button>
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="website"
          onClick={() => setActiveSection("website")}
          aria-label={copy.openWebsite}
        >
          <span>{copy.totalBanners}</span>
          <strong>{activeHeroBanners.length}/{heroBanners.length}</strong>
          <small>{copy.bannerSummary}</small>
        </button>
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="website"
          onClick={() => setActiveSection("website")}
          aria-label={copy.openWebsite}
        >
          <span>{copy.totalMarkets}</span>
          <strong>{activeMarkets.length}/{markets.length}</strong>
          <small>{copy.statusSummary}</small>
        </button>
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="website"
          onClick={() => setActiveSection("website")}
          aria-label={copy.openWebsite}
        >
          <span>{copy.totalTestimonials}</span>
          <strong>{activeTestimonials.length}/{testimonials.length}</strong>
          <small>{copy.statusSummary}</small>
        </button>
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="common"
          onClick={() => setActiveSection("website")}
          aria-label={language === "MN" ? "Вэб контент руу очих" : "Open website content"}
        >
          <span>{copy.firebaseSync}</span>
          <strong>
            {error
              ? copy.syncError
              : loading
                ? copy.syncLoading
                : saving
                  ? copy.syncSaving
                  : copy.syncLive}
          </strong>
        </button>
        <button
          type="button"
          className="admin-stat-card admin-stat-card-link admin-module-card"
          data-module="common"
          onClick={() => setActiveSection("website")}
          aria-label={language === "MN" ? "Вэб контент руу очих" : "Open website content"}
        >
          <span>{copy.firestoreStructure}</span>
          <strong>{backend}</strong>
        </button>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{language === "MN" ? "Системийн модуль архитектур" : "System module architecture"}</h2>
            <p>
              {language === "MN"
                ? "Нийтлэг цэсүүд болон Website, CRM, Finance, Factory module-ууд нэг sidebar navigation дээр төвлөрсөн бүтэц."
                : "A unified sidebar architecture for shared menus plus the Website, CRM, Finance, and Factory modules."}
            </p>
          </div>
        </div>
        <div className="admin-architecture-grid">
          {adminMenuGroups.map((group: any) => {
            const visibleItems = group.items.filter((item: any) => !item.requiresPrivilege || isPrivilegedUser);

            return (
              <div key={group.key} className="admin-architecture-card admin-module-card" data-module={group.key}>
                <span>{group.label}</span>
                <strong>{visibleItems.length}</strong>
                <p>{group.description}</p>
                <div className="admin-architecture-list">
                  {visibleItems.map((item: any) => (
                    <small key={item.id}>{item.label}</small>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.livePreview}</h2>
            <p>{copy.statusSummary}</p>
          </div>
        </div>
        <div className="admin-preview-grid">
          <div className="admin-preview-item">
            <Store size={18} />
            <div>
              <span>{copy.brandName}</span>
              <strong>{visibleSettings.brandName}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <Package size={18} />
            <div>
              <span>{copy.heroHeading}</span>
              <strong>{visibleSettings.heroHeading}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <Images size={18} />
            <div>
              <span>{copy.banners}</span>
              <strong>{activeHeroBanners[0] ? collectionNameBySlug.get(activeHeroBanners[0].collectionSlug) ?? "-" : "-"}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <MapPin size={18} />
            <div>
              <span>{copy.location}</span>
              <strong>{visibleSettings.location}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <MessageSquareQuote size={18} />
            <div>
              <span>{copy.testimonials}</span>
              <strong>{activeTestimonials[0]?.author ?? "-"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.firestoreStructure}</h2>
            <p>
              {language === "MN"
                ? "Firestore path-ууд болон active-only public visibility логик."
                : "Firestore paths and active-only public visibility logic."}
            </p>
          </div>
        </div>
        <div className="admin-structure-list">
          <code>{structure.site}</code>
          <code>{structure.settings}</code>
          <code>{structure.collections}</code>
          <code>{structure.products}</code>
          <code>{structure.orders}</code>
          <code>{structure.contactMessages}</code>
          <code>{structure.heroBanners}</code>
          <code>{structure.markets}</code>
          <code>{structure.testimonials}</code>
        </div>
        {error && <div className="admin-sync-error">{error}</div>}
      </div>
    </>
  );
}
