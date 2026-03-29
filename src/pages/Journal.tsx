import { CalendarDays, UserCircle2, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import type { JournalEntry } from "../data/storefront";
import {
  getActiveJournalEntries,
  getPageBannerNavigationItem,
  getPageBannerStyle,
  getRenderableSettings,
} from "../lib/storefrontHelpers";
import "./Journal.css";

function getLocalizedText(language: "EN" | "MN", english: string, mongolian: string) {
  const primary = language === "MN" ? mongolian : english;
  const fallback = language === "MN" ? english : mongolian;
  return primary.trim() || fallback.trim();
}

function formatJournalDate(value: string, language: "EN" | "MN") {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleDateString(language === "MN" ? "mn-MN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getJournalParagraphs(value: string) {
  return value
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export default function Journal() {
  const { language } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, "/journal");
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);
  const activeEntries = getActiveJournalEntries(visibleSettings.journalEntries);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const categories = Array.from(
    new Set(
      activeEntries
        .map((entry) => getLocalizedText(language, entry.categoryEn, entry.categoryMn))
        .filter(Boolean)
    )
  );

  const activeCategory =
    selectedCategory !== "all" && !categories.includes(selectedCategory) ? "all" : selectedCategory;

  const filteredEntries =
    activeCategory === "all"
      ? activeEntries
      : activeEntries.filter(
          (entry) => getLocalizedText(language, entry.categoryEn, entry.categoryMn) === activeCategory
        );

  const pageHeading = getLocalizedText(
    language,
    visibleSettings.journalHeadingEn,
    visibleSettings.journalHeadingMn
  );
  const pageSubtext = getLocalizedText(
    language,
    visibleSettings.journalSubtextEn,
    visibleSettings.journalSubtextMn
  );
  const selectedEntryTitle = selectedEntry
    ? getLocalizedText(language, selectedEntry.titleEn, selectedEntry.titleMn)
    : "";
  const selectedEntryCategory = selectedEntry
    ? getLocalizedText(language, selectedEntry.categoryEn, selectedEntry.categoryMn)
    : "";
  const selectedEntryExcerpt = selectedEntry
    ? getLocalizedText(language, selectedEntry.excerptEn, selectedEntry.excerptMn)
    : "";
  const selectedEntryParagraphs = getJournalParagraphs(selectedEntryExcerpt);

  return (
    <div className="journal-page">
      <section
        className={`journal-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="container">
          <h1>{pageHeading}</h1>
          <p>{pageSubtext}</p>
        </div>
      </section>

      <section className="journal-toolbar section">
        <div className="container">
          <div className="journal-toolbar-head">
            <div>
              <h2>{language === "MN" ? "Нийтлэлүүд" : "Stories"}</h2>
            </div>
            <span className="journal-count">
              {filteredEntries.length} {language === "MN" ? "нийтлэл" : "entries"}
            </span>
          </div>

          <div className="journal-filters" role="tablist" aria-label={language === "MN" ? "Ангиллын шүүлтүүр" : "Category filter"}>
            <button
              type="button"
              className={`journal-filter${activeCategory === "all" ? " active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              {language === "MN" ? "Бүгд" : "All"}
            </button>
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={`journal-filter${activeCategory === category ? " active" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {filteredEntries.length === 0 ? (
            <div className="journal-empty">
              <h3>{language === "MN" ? "Нийтлэл алга байна" : "No journal entries yet"}</h3>
              <p>
                {language === "MN"
                  ? "Website settings дотор journal entry нэмэхэд энд шууд харагдана."
                  : "Add journal entries from Website settings to populate this page."}
              </p>
            </div>
          ) : (
            <div className="journal-grid">
              {filteredEntries.map((entry) => {
                const category = getLocalizedText(language, entry.categoryEn, entry.categoryMn);
                const title = getLocalizedText(language, entry.titleEn, entry.titleMn);
                const excerpt = getLocalizedText(language, entry.excerptEn, entry.excerptMn);

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="journal-card journal-card-button"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="journal-card-media">
                      {entry.image.trim() ? (
                        <img src={entry.image} alt={title} />
                      ) : (
                        <div className="journal-card-media-fallback">{category.slice(0, 1) || "J"}</div>
                      )}
                      <div className="journal-card-image-meta">
                        {category && <span className="journal-card-category">{category}</span>}
                        <span className="journal-card-date">
                          <CalendarDays size={13} />
                          {formatJournalDate(entry.publishedAt, language)}
                        </span>
                      </div>
                    </div>
                    <div className="journal-card-body">
                      <h3>{title}</h3>
                      <p>{excerpt}</p>
                      {entry.author && (
                        <div className="journal-card-meta">
                          <span>
                            <UserCircle2 size={15} />
                            {entry.author}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {selectedEntry ? (
        <div className="journal-modal-backdrop" onClick={() => setSelectedEntry(null)}>
          <div
            className="journal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journal-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="journal-modal-close"
              onClick={() => setSelectedEntry(null)}
              aria-label={language === "MN" ? "Нийтлэл хаах" : "Close article"}
            >
              <X size={18} />
            </button>
            <div className="journal-modal-media">
              {selectedEntry.image.trim() ? (
                <img src={selectedEntry.image} alt={selectedEntryTitle} />
              ) : (
                <div className="journal-card-media-fallback">{selectedEntryCategory.slice(0, 1) || "J"}</div>
              )}
            </div>
            <div className="journal-modal-body">
              <span className="journal-card-category">{selectedEntryCategory}</span>
              <h3 id="journal-modal-title">{selectedEntryTitle}</h3>
              <div className="journal-card-meta journal-modal-meta">
                <span>
                  <CalendarDays size={15} />
                  {formatJournalDate(selectedEntry.publishedAt, language)}
                </span>
                <span>
                  <UserCircle2 size={15} />
                  {selectedEntry.author}
                </span>
              </div>
              <div className="journal-modal-content">
                {(selectedEntryParagraphs.length > 0 ? selectedEntryParagraphs : [selectedEntryExcerpt]).map((paragraph, index) => (
                  <p key={`${selectedEntry.id}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
