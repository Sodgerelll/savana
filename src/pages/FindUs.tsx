import { MapPin, Clock, Calendar, Instagram } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import "./FindUs.css";

const markets = [
  {
    name: "Calgary Farmers' Market",
    schedule: "Saturdays, 9am – 3pm",
    address: "510 77 Ave SE, Calgary, AB",
    season: "Year-round",
  },
  {
    name: "Edmonton City Market",
    schedule: "Saturdays, 8am – 3pm",
    address: "103A Ave & 97 St NW, Edmonton, AB",
    season: "May – October",
  },
  {
    name: "Red Deer Farmers' Market",
    schedule: "Saturdays, 8am – 1pm",
    address: "4747 53 St, Red Deer, AB",
    season: "Year-round",
  },
  {
    name: "Lethbridge Farmer's Market",
    schedule: "Thursdays, 10am – 2pm",
    address: "400 Stafford Dr N, Lethbridge, AB",
    season: "April – October",
  },
];

export default function FindUs() {
  const { t } = useLanguage();

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
                  <p>Alberta, Canada</p>
                  <p className="map-note">
                    We sell at farmers' markets and craft fairs across Alberta.
                    Follow us on Instagram for the most up-to-date schedule.
                  </p>
                  <a
                    href="https://instagram.com/prairiesoapshack"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline map-ig-btn"
                  >
                    <Instagram size={16} />
                    @prairiesoapshack
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
                <p>
                  We participate in markets and craft fairs throughout Alberta,
                  from spring through fall, with select winter markets in December.
                  Check our Instagram for the most current schedule.
                </p>
              </div>

              <div className="find-us-card">
                <div className="find-us-card-icon">
                  <Clock size={22} strokeWidth={1.2} />
                </div>
                <h3>{t.storeHours}</h3>
                <p>
                  We are an online-first business. Orders are shipped Monday–Friday.
                  Market hours vary by location — see our schedule below.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Markets list */}
      <section className="markets-section section">
        <div className="container">
          <div className="section-header">
            <h2>Where to Find Us</h2>
            <p>We're at these markets throughout the year. Come say hello!</p>
          </div>
          <div className="markets-grid">
            {markets.map((market, index) => (
              <div key={index} className="market-card">
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
            <h2>Carry Prairie Soap Shack in Your Store?</h2>
            <p>
              We welcome wholesale inquiries from local retailers, spas, and boutiques
              across Alberta and beyond. Let's work together to bring prairie-crafted
              natural products to more people.
            </p>
            <a href="mailto:wholesale@prairiesoapshack.com" className="btn btn-primary">
              Inquire About Wholesale
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
