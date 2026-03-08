import { Mail, MapPin, Clock } from "lucide-react";
import "./Contact.css";

export default function Contact() {
  return (
    <div className="contact-page">
      <div className="contact-hero">
        <h1>Contact Us</h1>
        <p>We'd love to hear from you. Get in touch with any questions or feedback.</p>
      </div>

      <section className="section">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-form-section">
              <h2>Send Us a Message</h2>
              <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input type="text" id="name" placeholder="Your name" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input type="email" id="email" placeholder="Your email" />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="subject">Subject</label>
                  <input type="text" id="subject" placeholder="What's this about?" />
                </div>
                <div className="form-group">
                  <label htmlFor="message">Message</label>
                  <textarea id="message" rows={6} placeholder="Your message..." />
                </div>
                <button type="submit" className="btn btn-primary">Send Message</button>
              </form>
            </div>

            <div className="contact-info-section">
              <div className="contact-info-card">
                <Mail size={24} strokeWidth={1.2} />
                <h3>Email</h3>
                <a href="mailto:hello@prairiesoapshack.com">hello@prairiesoapshack.com</a>
              </div>
              <div className="contact-info-card">
                <MapPin size={24} strokeWidth={1.2} />
                <h3>Location</h3>
                <p>Alberta, Canada</p>
              </div>
              <div className="contact-info-card">
                <Clock size={24} strokeWidth={1.2} />
                <h3>Response Time</h3>
                <p>We typically respond within 24-48 hours</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
