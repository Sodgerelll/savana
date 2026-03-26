import { useState, type ChangeEvent, type FormEvent } from "react";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { createContactMessage } from "../lib/contactMessages";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./Contact.css";

const initialFormState = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

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
  const mapLink =
    "https://www.google.com/maps/place/SAVANA+BRAND/@47.9167711,106.939625,584m/data=!3m2!1e3!4b1!4m6!3m5!1s0x5d96930061a87f33:0xeea1567f36e7cd41!8m2!3d47.9167711!4d106.939625!16s%2Fg%2F11wjpf89k5?entry=ttu&g_ep=EgoyMDI2MDMxMS4wIKXMDSoASAFQAw%3D%3D";
  const mapEmbedSrc = "https://maps.google.com/maps?q=47.9167711,106.939625&z=17&output=embed";

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: value,
    }));

    if (submitStatus !== "idle") {
      setSubmitStatus("idle");
      setSubmitError(null);
    }
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
      <div
        className={`contact-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="container">
          <h1>{t.contactHeading}</h1>
          <p>{t.contactSub}</p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-form-section">
              <h2>{t.sendMessage}</h2>
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">{t.name}</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      placeholder={t.namePlaceholder}
                      value={formValues.name}
                      onChange={handleFieldChange}
                      disabled={submitStatus === "submitting"}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">{t.email}</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder={t.emailPlaceholder}
                      value={formValues.email}
                      onChange={handleFieldChange}
                      disabled={submitStatus === "submitting"}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="subject">{t.subject}</label>
                  <input
                    type="text"
                    id="subject"
                    name="subject"
                    placeholder={t.subjectPlaceholder}
                    value={formValues.subject}
                    onChange={handleFieldChange}
                    disabled={submitStatus === "submitting"}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="message">{t.message}</label>
                  <textarea
                    id="message"
                    name="message"
                    rows={6}
                    placeholder={t.messagePlaceholder}
                    value={formValues.message}
                    onChange={handleFieldChange}
                    disabled={submitStatus === "submitting"}
                    required
                  />
                </div>
                {submitStatus === "success" ? (
                  <p className="contact-form-feedback success">{t.messageSentSuccess}</p>
                ) : null}
                {submitError ? (
                  <p className="contact-form-feedback error">{submitError}</p>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={submitStatus === "submitting"}>
                  {submitStatus === "submitting" ? t.sendingMessage : t.sendBtn}
                </button>
              </form>
            </div>

            <div className="contact-info-section">
              {contactPhone ? (
                <div className="contact-info-card">
                  <div className="contact-info-icon">
                    <Phone size={22} strokeWidth={1.2} />
                  </div>
                  <h3>{t.phoneNumber}</h3>
                  <a href={`tel:${contactPhoneHref}`}>{contactPhone}</a>
                </div>
              ) : null}
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <Mail size={22} strokeWidth={1.2} />
                </div>
                <h3>{t.email}</h3>
                <a href={`mailto:${visibleSettings.contactEmail}`}>{visibleSettings.contactEmail}</a>
              </div>
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <MapPin size={22} strokeWidth={1.2} />
                </div>
                <h3>{language === "MN" ? "Байршил" : "Location"}</h3>
                <p>{visibleSettings.location}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="contact-visit-section">
        <div className="container">
          <div className="contact-visit-layout">
            <div className="contact-map-card">
              <iframe
                title={visibleSettings.location || "Map"}
                src={mapEmbedSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="contact-map-frame"
              />
            </div>
            <div className="contact-visit-card">
              <span className="contact-section-kicker">
                {language === "MN" ? "Байршил & сувгууд" : "Location & channels"}
              </span>
              <h2>{language === "MN" ? "SAVANA-тай холбогдоорой" : "Reach SAVANA from one place"}</h2>
              <p>
                {language === "MN"
                  ? "Байршил, утас, сошиал сувгууд, map чиглэл бүгд энэ хуудсан дээр нэгтгэгдсэн."
                  : "Location details, phone, social channels, and map directions are now consolidated on this page."}
              </p>
              <div className="contact-visit-actions">
                <a href={mapLink} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                  <MapPin size={16} />
                  {language === "MN" ? "Google Maps дээр харах" : "View on Google Maps"}
                </a>
                <a
                  href={visibleSettings.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  <Facebook size={16} />
                  Facebook
                </a>
                <a
                  href={visibleSettings.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  <Instagram size={16} />
                  {visibleSettings.instagramHandle}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
