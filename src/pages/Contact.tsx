import { useState, type ChangeEvent, type FormEvent } from "react";
import { Facebook, Instagram, Mail, Phone } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { createContactMessage } from "../lib/contactMessages";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./Contact.css";

const initialFormState = { name: "", email: "", subject: "", message: "" };

export default function Contact() {
  const { language, t } = useLanguage();
  const { settings } = useStorefront();
  const [formValues, setFormValues] = useState(initialFormState);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, "/contact");
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);
  const contactPhone = visibleSettings.contactPhone.trim();
  const contactPhoneHref = contactPhone.replace(/\s+/g, "");
  const mapEmbedSrc = "https://maps.google.com/maps?q=47.9167711,106.939625&z=17&output=embed";
  const isMN = language === "MN";

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormValues((cur) => ({ ...cur, [name]: value }));
    if (submitStatus !== "idle") { setSubmitStatus("idle"); setSubmitError(null); }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      name: formValues.name.trim(),
      email: formValues.email.trim(),
      subject: formValues.subject.trim(),
      message: formValues.message.trim(),
    };
    if (!payload.name || !payload.email || !payload.subject || !payload.message) {
      setSubmitStatus("error");
      setSubmitError(t.messageFormValidationError);
      return;
    }
    setSubmitStatus("submitting");
    setSubmitError(null);
    try {
      await createContactMessage(payload);
      setFormValues(initialFormState);
      setSubmitStatus("success");
    } catch {
      setSubmitStatus("error");
      setSubmitError(t.messageSendFailed);
    }
  };

  return (
    <div className="contact-page">

      {/* ── Hero ── */}
      <div className={`contact-hero${hasPageBanner ? " has-banner" : ""}`} style={pageBannerStyle}>
        <div className="container">
          <h1>{t.contactHeading}</h1>
          <p>{t.contactSub}</p>
        </div>
      </div>

      {/* ── Strip: утас · и-мэйл · Facebook · Instagram ── */}
      <div className="contact-strip">
        <div className="container">
          <div className="contact-strip-grid">
            {contactPhone && (
              <a href={`tel:${contactPhoneHref}`} className="contact-strip-item">
                <Phone size={18} strokeWidth={1.4} className="contact-strip-icon" />
                <span className="contact-strip-label">{t.phoneNumber}</span>
                <span className="contact-strip-value">{contactPhone}</span>
              </a>
            )}
            <a href={`mailto:${visibleSettings.contactEmail}`} className="contact-strip-item">
              <Mail size={18} strokeWidth={1.4} className="contact-strip-icon" />
              <span className="contact-strip-label">{isMN ? "И-мэйл" : "Email"}</span>
              <span className="contact-strip-value">{visibleSettings.contactEmail}</span>
            </a>
            <a href={visibleSettings.facebookUrl} target="_blank" rel="noopener noreferrer" className="contact-strip-item">
              <Facebook size={18} strokeWidth={1.4} className="contact-strip-icon" />
              <span className="contact-strip-label">Facebook</span>
              <span className="contact-strip-value">SAVANA Brand</span>
            </a>
            <a href={visibleSettings.instagramUrl} target="_blank" rel="noopener noreferrer" className="contact-strip-item">
              <Instagram size={18} strokeWidth={1.4} className="contact-strip-icon" />
              <span className="contact-strip-label">Instagram</span>
              <span className="contact-strip-value">{visibleSettings.instagramHandle}</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── Form + sidebar ── */}
      <section className="section">
        <div className="container">
          <div className="contact-grid">

            {/* Form */}
            <div className="contact-form-section">
              <span className="contact-section-kicker">{isMN ? "Санал, хүсэлт" : "Get in touch"}</span>
              <h2>{t.sendMessage}</h2>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">{t.name}</label>
                    <input type="text" id="name" name="name" placeholder={t.namePlaceholder}
                      value={formValues.name} onChange={handleFieldChange}
                      disabled={submitStatus === "submitting"} required />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">{t.email}</label>
                    <input type="email" id="email" name="email" placeholder={t.emailPlaceholder}
                      value={formValues.email} onChange={handleFieldChange}
                      disabled={submitStatus === "submitting"} required />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="subject">{t.subject}</label>
                  <input type="text" id="subject" name="subject" placeholder={t.subjectPlaceholder}
                    value={formValues.subject} onChange={handleFieldChange}
                    disabled={submitStatus === "submitting"} required />
                </div>
                <div className="form-group">
                  <label htmlFor="message">{t.message}</label>
                  <textarea id="message" name="message" rows={6} placeholder={t.messagePlaceholder}
                    value={formValues.message} onChange={handleFieldChange}
                    disabled={submitStatus === "submitting"} required />
                </div>
                {submitStatus === "success" && (
                  <p className="contact-form-feedback success">{t.messageSentSuccess}</p>
                )}
                {submitError && (
                  <p className="contact-form-feedback error">{submitError}</p>
                )}
                <button type="submit" className="btn btn-primary" disabled={submitStatus === "submitting"}>
                  {submitStatus === "submitting" ? t.sendingMessage : t.sendBtn}
                </button>
              </form>
            </div>

            {/* Sidebar: ажлын цаг + тайлбар */}
            <aside className="contact-sidebar">
              <div className="contact-sidebar-card">
                <h3>{isMN ? "Ажлын цаг" : "Working hours"}</h3>
                <div className="contact-hours">
                  <div className="contact-hours-row">
                    <span>{isMN ? "Да – Ба" : "Mon – Fri"}</span>
                    <span>09:00 – 18:00</span>
                  </div>
                  <div className="contact-hours-row">
                    <span>{isMN ? "Бя – Ня" : "Sat – Sun"}</span>
                    <span>{isMN ? "Амарна" : "Closed"}</span>
                  </div>
                </div>
              </div>
              <div className="contact-sidebar-note">
                <p>
                  {isMN
                    ? "Бид таны санал хүсэлтийг ихэд үнэлдэг бөгөөд аливаа асуултад хурдан хугацаанд хариу өгөх болно."
                    : "We value every message and aim to respond to all inquiries as quickly as possible."}
                </p>
              </div>
            </aside>

          </div>
        </div>
      </section>

      {/* ── Газрын зураг + байршлын карт ── */}
      <section className="contact-visit-section">
        <div className="container">
          <div className="contact-visit-layout">
            <div className="contact-visit-header">
              <span className="contact-section-kicker">
                {isMN ? "Байршил" : "Location"}
              </span>
            </div>
            <div className="contact-map-card">
              <iframe
                title={visibleSettings.location || "Map"}
                src={mapEmbedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="contact-map-frame"
              />
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
