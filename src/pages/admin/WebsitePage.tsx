/* eslint-disable @typescript-eslint/no-explicit-any */
import { Globe, Images, MessageSquareQuote, Package, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";

export default function WebsitePage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    settings,
    heroBanners,
    markets,
    testimonials,
    activeNavigationItems,
    activeJournalEntries,
    activeHeroBanners,
    activeMarkets,
    activeTestimonials,
    navigationPreviewItems,
    journalPreviewEntries,
    inactiveNavigationItems,
    contactMessages,
    bannerCategories,
    collectionNameBySlug,
    isPrivilegedUser,
    openHeroBannerModal,
    openSettingsModal,
    openNavigationModal,
    openJournalEntryModal,
    openJournalSettingsModal,
    openMarketModal,
    openTestimonialModal,
    handleHeroBannerDeleteRequest,
    handleNavigationDeleteRequest,
    handleJournalEntryDeleteRequest,
    handleMarketDeleteRequest,
    handleTestimonialDeleteRequest,
    formatAdminDateTime,
    getLocalizedManagedText,
    getManagedNavigationLabel,
    getManagedJournalTitle,
    getManagedJournalCategory,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.website}</p>
          <h1>{copy.websiteTitle}</h1>
          <p>{copy.websiteText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => openHeroBannerModal()}
            disabled={bannerCategories.length === 0}
          >
            <Images size={16} />
            {copy.createBanner}
          </button>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn-neutral"
            onClick={openSettingsModal}
            aria-label={copy.editWebsite}
          >
            <Pencil size={16} />
          </button>
        </div>
      </div>

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.settings}</strong>
            <StatusBadge
              status={settings.status}
              activeLabel={copy.active}
              inactiveLabel={copy.inactive}
            />
          </div>
          <p>{settings.brandName}</p>
          <small>{copy.settingsInactiveNote}</small>
        </div>
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.navigation}</strong>
            <span>{activeNavigationItems.length}/{settings.navigationItems.length}</span>
          </div>
          <p>{copy.navigationSummary}</p>
        </div>
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.journal}</strong>
            <span>{activeJournalEntries.length}/{settings.journalEntries.length}</span>
          </div>
          <p>{copy.journalSummary}</p>
        </div>
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.banners}</strong>
            <span>{activeHeroBanners.length}/{heroBanners.length}</span>
          </div>
          <p>{copy.bannerSummary}</p>
        </div>
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.markets}</strong>
            <span>{activeMarkets.length}/{markets.length}</span>
          </div>
          <p>{copy.marketSummary}</p>
        </div>
        <div className="admin-summary-card">
          <div className="admin-inline-card-head">
            <strong>{copy.testimonials}</strong>
            <span>{activeTestimonials.length}/{testimonials.length}</span>
          </div>
          <p>{copy.testimonialSummary}</p>
        </div>
        {isPrivilegedUser ? (
          <div className="admin-summary-card">
            <div className="admin-inline-card-head">
              <strong>{copy.messagesMenu}</strong>
              <span>{contactMessages.length}</span>
            </div>
            <p>{copy.messagesSummary}</p>
          </div>
        ) : null}
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.banners}</h2>
            <p>{copy.bannerSummary}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openHeroBannerModal()}
            disabled={bannerCategories.length === 0}
          >
            <Plus size={16} />
            {copy.createBanner}
          </button>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.bannerImage}</th>
                <th>{copy.bannerCollection}</th>
                <th>{copy.status}</th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {heroBanners.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-table-empty">
                    {copy.bannerSummary}
                  </td>
                </tr>
              ) : (
                heroBanners.map((heroBanner: any) => (
                  <tr key={heroBanner.id}>
                    <td>
                      <div className="admin-table-primary-row">
                        <div className="admin-product-thumb">
                          {heroBanner.image ? (
                            <img src={heroBanner.image} alt={collectionNameBySlug.get(heroBanner.collectionSlug) ?? copy.banners} />
                          ) : (
                            <span>B</span>
                          )}
                        </div>
                        <div className="admin-table-primary">
                          <strong>{collectionNameBySlug.get(heroBanner.collectionSlug) ?? "-"}</strong>
                          <small>
                            #{heroBanner.id} • {heroBanner.source === "prairiesoapshack.com" ? copy.bannerImportedSource : copy.bannerUploadedSource}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{collectionNameBySlug.get(heroBanner.collectionSlug) ?? heroBanner.collectionSlug}</td>
                    <td>
                      <StatusBadge
                        status={heroBanner.status}
                        activeLabel={copy.active}
                        inactiveLabel={copy.inactive}
                      />
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={() => openHeroBannerModal(heroBanner)}
                          aria-label={`${copy.edit} ${heroBanner.id}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => handleHeroBannerDeleteRequest(heroBanner)}
                          aria-label={`${copy.delete} ${heroBanner.id}`}
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
        {bannerCategories.length === 0 && <div className="admin-sync-error">{copy.noCategories}</div>}
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.settings}</h2>
            <p>{copy.settingsInactiveNote}</p>
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-icon-btn-neutral"
            onClick={openSettingsModal}
            aria-label={copy.edit}
          >
            <Pencil size={16} />
          </button>
        </div>
        <div className="admin-preview-grid">
          <div className="admin-preview-item">
            <Store size={18} />
            <div>
              <span>{copy.brandName}</span>
              <strong>{settings.brandName}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <Package size={18} />
            <div>
              <span>{copy.heroHeading}</span>
              <strong>{settings.heroHeading}</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <Globe size={18} />
            <div>
              <span>{copy.navigation}</span>
              <strong>{activeNavigationItems.length} active</strong>
            </div>
          </div>
          <div className="admin-preview-item">
            <MessageSquareQuote size={18} />
            <div>
              <span>{copy.journal}</span>
              <strong>{getLocalizedManagedText(language, settings.journalHeadingEn, settings.journalHeadingMn)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.navigation}</h2>
            <p>{copy.navigationSummary}</p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => inactiveNavigationItems[0] && openNavigationModal(inactiveNavigationItems[0])}
            disabled={inactiveNavigationItems.length === 0}
          >
            <Plus size={16} />
            {copy.add}
          </button>
        </div>
        <div className="admin-stack">
          {navigationPreviewItems.map((item: any) => {
            const navigationLabel = getManagedNavigationLabel(item, language);
            const hasPageBannerImage = Boolean(item.pageBannerImage.trim());

            return (
              <div key={item.id} className="admin-inline-card">
                <div className="admin-inline-card-head">
                  <div className="admin-entity-head admin-navigation-entity">
                    <div className="admin-navigation-thumb">
                      {hasPageBannerImage ? (
                        <img src={item.pageBannerImage} alt={navigationLabel} />
                      ) : (
                        <span>{navigationLabel.slice(0, 1) || item.id.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="admin-navigation-copy">
                      <strong>{navigationLabel}</strong>
                      <small>{item.id}</small>
                    </div>
                    <StatusBadge
                      status={item.status}
                      activeLabel={copy.active}
                      inactiveLabel={copy.inactive}
                    />
                  </div>
                  <div className="admin-entity-actions">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn-neutral"
                      onClick={() => openNavigationModal(item)}
                      aria-label={`${copy.edit} ${item.id}`}
                    >
                      <Pencil size={16} />
                    </button>
                    {item.status === "active" ? (
                      <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={() => handleNavigationDeleteRequest(item)}
                        aria-label={`${copy.delete} ${item.id}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <small>
                  {item.group === "left" ? copy.leftGroup : copy.rightGroup}
                  {" • "}
                  {copy.sortOrder} #{item.sortOrder}
                </small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.journal}</h2>
            <p>{copy.journalSummary}</p>
          </div>
          <div className="admin-topbar-actions">
            <button type="button" className="btn btn-outline" onClick={openJournalSettingsModal}>
              <Pencil size={16} />
              {copy.editJournalSection}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openJournalEntryModal()}>
              <Plus size={16} />
              {copy.createJournal}
            </button>
          </div>
        </div>
        <div className="admin-stack">
          <div className="admin-inline-card">
            <strong>{getLocalizedManagedText(language, settings.journalHeadingEn, settings.journalHeadingMn)}</strong>
            <small>
              {getLocalizedManagedText(language, settings.journalSubtextEn, settings.journalSubtextMn)}
            </small>
          </div>
          {journalPreviewEntries.length === 0 ? (
            <div className="admin-inline-card">
              <p>{copy.journalSummary}</p>
            </div>
          ) : (
            journalPreviewEntries.map((entry: any) => (
              <div key={entry.id} className="admin-inline-card">
                <div className="admin-inline-card-head">
                  <div className="admin-entity-head admin-navigation-entity">
                    <div className="admin-navigation-thumb">
                      {entry.image.trim() ? (
                        <img
                          src={entry.image}
                          alt={getManagedJournalTitle(entry, language) || `${copy.journal} #${entry.id}`}
                        />
                      ) : (
                        <span>
                          {(getManagedJournalTitle(entry, language) ||
                            getManagedJournalCategory(entry, language) ||
                            "J"
                          )
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="admin-navigation-copy">
                      <strong>{getManagedJournalTitle(entry, language) || `${copy.journal} #${entry.id}`}</strong>
                      <small>{getManagedJournalCategory(entry, language) || `#${entry.id}`}</small>
                    </div>
                    <StatusBadge
                      status={entry.status}
                      activeLabel={copy.active}
                      inactiveLabel={copy.inactive}
                    />
                  </div>
                  <div className="admin-entity-actions">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn-neutral"
                      onClick={() => openJournalEntryModal(entry)}
                      aria-label={`${copy.edit} ${entry.id}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      onClick={() => handleJournalEntryDeleteRequest(entry)}
                      aria-label={`${copy.delete} ${entry.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <small>
                  {formatAdminDateTime(entry.publishedAt, language)}
                  {entry.author ? ` • ${entry.author}` : ""}
                </small>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.markets}</h2>
            <p>{copy.marketSummary}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openMarketModal()}>
            <Plus size={16} />
            {copy.createMarket}
          </button>
        </div>
        <div className="admin-stack">
          {markets.map((market: any) => (
            <div key={market.id} className="admin-inline-card">
              <div className="admin-inline-card-head">
                <div className="admin-entity-head">
                  <strong>{market.name || "Market"}</strong>
                  <StatusBadge status={market.status} activeLabel={copy.active} inactiveLabel={copy.inactive} />
                </div>
                <div className="admin-entity-actions">
                  <button
                    type="button"
                    className="admin-icon-btn admin-icon-btn-neutral"
                    onClick={() => openMarketModal(market)}
                    aria-label={`${copy.edit} ${market.name || "market"}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="admin-icon-btn" onClick={() => handleMarketDeleteRequest(market)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p>{market.schedule || "-"}</p>
              <small>{market.address || "-"}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-section-card">
        <div className="admin-section-head">
          <div>
            <h2>{copy.testimonials}</h2>
            <p>{copy.testimonialSummary}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openTestimonialModal()}>
            <Plus size={16} />
            {copy.createTestimonial}
          </button>
        </div>
        <div className="admin-stack">
          {testimonials.map((testimonial: any) => (
            <div key={testimonial.id} className="admin-inline-card">
              <div className="admin-inline-card-head">
                <div className="admin-entity-head">
                  <strong>{testimonial.author || "Customer"}</strong>
                  <StatusBadge
                    status={testimonial.status}
                    activeLabel={copy.active}
                    inactiveLabel={copy.inactive}
                  />
                </div>
                <div className="admin-entity-actions">
                  <button
                    type="button"
                    className="admin-icon-btn admin-icon-btn-neutral"
                    onClick={() => openTestimonialModal(testimonial)}
                    aria-label={`${copy.edit} ${testimonial.author || "testimonial"}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn"
                    onClick={() => handleTestimonialDeleteRequest(testimonial)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p>{testimonial.text || "-"}</p>
              <small>{testimonial.location || "-"}</small>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
