import { MapPin, Clock, Calendar, Facebook, Instagram } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getActiveMarkets, getRenderableSettings } from "../lib/storefrontHelpers";
import "./FindUs.css";

export default function FindUs() {
  const { language, t } = useLanguage();
  const { markets, settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const activeMarkets = getActiveMarkets(markets);
  const hasMapLink = /^https?:\/\//i.test(visibleSettings.mapNote);

  return (
    <div className="find-us-page">
      <div className="find-us-hero">
        <div className="container">
          <h1>{t.findUsHeading}</h1>
          <p>{t.findUsSub}</p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="find-us-grid">
            {/* Map placeholder */}
            <div className="map-section">
              <h2>{t.ourLocation}</h2>
              <div className="map-placeholder">
                <div className="map-placeholder-inner">
                  <MapPin size={48} strokeWidth={1} />
                  <p>{visibleSettings.location}</p>
                  {hasMapLink ? (
                    <a
                      href={visibleSettings.mapNote}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="map-note map-note-link"
                    >
                      {language === "MN" ? "Google Maps дээр харах" : "View on Google Maps"}
                    </a>
                  ) : (
                    <p className="map-note">{visibleSettings.mapNote}</p>
                  )}
                  <a
                    href={visibleSettings.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline map-ig-btn"
                  >
                    <Facebook size={16} />
                    Facebook
                  </a>
                  <a
                    href={visibleSettings.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline map-ig-btn"
                  >
                    <Instagram size={16} />
                    {visibleSettings.instagramHandle}
                  </a>
                </div>
              </div>
            </div>

            {/* Info section */}
            <div className="find-us-info">
              <div className="find-us-card">
                <div className="find-us-card-icon">
                  <Calendar size={22} strokeWidth={1.2} />
                </div>
                <h3>{t.marketSchedule}</h3>
                <p>{visibleSettings.marketIntro}</p>
              </div>

              <div className="find-us-card">
                <div className="find-us-card-icon">
                  <Clock size={22} strokeWidth={1.2} />
                </div>
                <h3>{t.storeHours}</h3>
                <p>{visibleSettings.storeHoursText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Markets list */}
      <section className="markets-section section">
        <div className="container">
          <div className="section-header">
            <h2>{language === "MN" ? "Биднийг эндээс олоорой" : "Where to Find Us"}</h2>
            <p>{language === "MN" ? "Жилийн турш оролцдог зах, эвентүүдийн мэдээлэл." : "Markets and seasonal events currently configured in the shop admin."}</p>
          </div>
          <div className="markets-grid">
            {activeMarkets.map((market) => (
              <div key={market.id} className="market-card">
                <div className="market-card-header">
                  <MapPin size={18} className="market-icon" />
                  <h3>{market.name}</h3>
                </div>
                <div className="market-detail">
                  <Clock size={14} />
                  <span>{market.schedule}</span>
                </div>
                <div className="market-detail">
                  <MapPin size={14} />
                  <span>{market.address}</span>
                </div>
                <div className="market-season">
                  <Calendar size={14} />
                  <span>{market.season}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wholesale CTA */}
      <section className="find-us-cta">
        <div className="container">
          <div className="find-us-cta-inner">
            <h2>{visibleSettings.wholesaleHeading}</h2>
            <p>{visibleSettings.wholesaleText}</p>
            <a href={`mailto:${visibleSettings.wholesaleEmail}`} className="btn btn-primary">
              {language === "MN" ? "Бөөний хамтын ажиллагаа" : "Inquire About Wholesale"}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
