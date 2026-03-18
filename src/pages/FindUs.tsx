import { MapPin, Facebook, Instagram } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./FindUs.css";

export default function FindUs() {
  const { language, t } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, "/find-us");
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);
  const mapLink =
    "https://www.google.com/maps/place/SAVANA+BRAND/@47.9167711,106.939625,584m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5d96930061a87f33:0xeea1567f36e7cd41!8m2!3d47.9167711!4d106.939625!16s%2Fg%2F11wjpf89k5?entry=ttu&g_ep=EgoyMDI2MDMxMS4wIKXMDSoASAFQAw%3D%3D";
  const mapEmbedSrc = "https://maps.google.com/maps?q=47.9167711,106.939625&z=17&output=embed";

  return (
    <div className="find-us-page">
      <div
        className={`find-us-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="container">
          <h1>{t.findUsHeading}</h1>
          {t.findUsSub.trim() ? <p>{t.findUsSub}</p> : null}
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="find-us-grid">
            <div className="map-section">
              <div className="find-us-layout">
                <div className="map-placeholder">
                  <iframe
                    title={visibleSettings.location || "Map"}
                    src={mapEmbedSrc}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="map-frame"
                  />
                </div>
                <div className="find-us-side">
                  <div className="find-us-side-card">
                    <div className="find-us-side-icon">
                      <MapPin size={20} strokeWidth={1.5} />
                    </div>
                    <p className="find-us-location">{visibleSettings.location}</p>
                    <a
                      href={mapLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="map-note map-note-link"
                    >
                      {language === "MN" ? "Google Maps дээр харах" : "View on Google Maps"}
                    </a>
                  </div>
                  <div className="find-us-side-card social-card">
                    <a href="tel:77770081" className="find-us-phone">
                      77770081
                    </a>
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
            </div>
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
