import { Mail, MapPin, Clock } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import "./Contact.css";

export default function Contact() {
  const { t } = useLanguage();

  return (
    <div className="contact-page">
      <div className="contact-hero">
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
              <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">{t.name}</label>
                    <input type="text" id="name" placeholder={t.namePlaceholder} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">{t.email}</label>
                    <input type="email" id="email" placeholder={t.emailPlaceholder} />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="subject">{t.subject}</label>
                  <input type="text" id="subject" placeholder={t.subjectPlaceholder} />
                </div>
                <div className="form-group">
                  <label htmlFor="message">{t.message}</label>
                  <textarea id="message" rows={6} placeholder={t.messagePlaceholder} />
                </div>
                <button type="submit" className="btn btn-primary">{t.sendBtn}</button>
              </form>
            </div>

            <div className="contact-info-section">
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <Mail size={22} strokeWidth={1.2} />
                </div>
                <h3>{t.email}</h3>
                <a href="mailto:hello@prairiesoapshack.com">hello@prairiesoapshack.com</a>
              </div>
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <MapPin size={22} strokeWidth={1.2} />
                </div>
                <h3>Location</h3>
                <p>Alberta, Canada</p>
              </div>
              <div className="contact-info-card">
                <div className="contact-info-icon">
                  <Clock size={22} strokeWidth={1.2} />
                </div>
                <h3>Response Time</h3>
                <p>We typically respond within 24–48 hours</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
