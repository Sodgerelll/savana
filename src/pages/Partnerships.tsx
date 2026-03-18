import { BadgeCheck, BriefcaseBusiness, Palette, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./Partnerships.css";

export default function Partnerships() {
  const { language } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, "/partnerships");
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);

  const copy =
    language === "MN"
      ? {
          heroTitle: "Хамтрал",
          heroBody:
            "Байгууллага, хувь хүн, арга хэмжээ, бэлгийн цуглуулгад зориулж өөрийн нэр, лого, өнгө төрхөөр шийдсэн бүтээгдэхүүн захиалах боломжтой.",
          introKicker: "Custom Brand Service",
          introTitle: "Таны брэндэд нийцсэн бүтээгдэхүүн",
          introBody:
            "SAVANA нь өөрийн шошго, өнгө, нэршилтэйгээр саван, арчилгааны бүтээгдэхүүн, бэлгийн багц хөгжүүлэх хамтрал дээр ажиллана. Жижиг багцаас эхлээд байгууллагын захиалга хүртэл уян хатан шийдэл санал болгоно.",
          featuresTitle: "Юуг өөрчлөн захиалж болох вэ",
          audiencesTitle: "Хэнд зориулсан вэ",
          processTitle: "Хэрхэн хамтарч ажиллах вэ",
          featureOneTitle: "Лого ба нэршил",
          featureOneBody: "Шошго, хайрцаг, бэлгийн карт дээр өөрийн брэндийн нэр болон логог байршуулна.",
          featureTwoTitle: "Өнгө ба төрх",
          featureTwoBody: "Брэндийн өнгө аяст нийцсэн palette, материал, presentation direction-ийг тааруулна.",
          featureThreeTitle: "Бүтээгдэхүүний сонголт",
          featureThreeBody: "Бэлгийн багц, байгууллагын тараах багц, private label цуврал зэргийг хамт боловсруулна.",
          audienceOne: "Компани, байгууллагын бэлэг ба event kit",
          audienceTwo: "Кафе, буудал, студи, boutique-ийн private label захиалга",
          audienceThree: "Хувийн брэнд, жижиг бизнесийн capsule collection",
          stepOneTitle: "1. Brief",
          stepOneBody: "Брэндийн зорилго, хэмжээ, хүссэн бүтээгдэхүүн, өнгө төрхөө илгээнэ.",
          stepTwoTitle: "2. Direction",
          stepTwoBody: "Бид формат, савлагаа, визуал чиглэл болон үнийн санал боловсруулна.",
          stepThreeTitle: "3. Sample",
          stepThreeBody: "Шаардлагатай бол sample эсвэл жижиг batch-аар баталгаажуулна.",
          stepFourTitle: "4. Production",
          stepFourBody: "Батлагдсан хувилбараар үйлдвэрлэл, савлагаа, нийлүүлэлтийг зохион байгуулна.",
          ctaTitle: visibleSettings.wholesaleHeading.trim() || "Хамтрал эхлүүлэх",
          ctaBody:
            visibleSettings.wholesaleText.trim() ||
            "Төслийн дэлгэрэнгүй, тоо хэмжээ, хугацаа, хүссэн визуал чиглэлээ илгээгээд хамтын захиалгаа эхлүүлээрэй.",
          emailCta: "Имэйлээр холбогдох",
          contactCta: "Холбоо барих хуудас",
        }
      : {
          heroTitle: "Partnerships",
          heroBody:
            "For organizations and individuals who want products produced with their own logo, name, and color direction.",
          introKicker: "Custom Brand Service",
          introTitle: "Products shaped around your brand",
          introBody:
            "SAVANA works with organizations, events, and independent brands on custom soaps, care products, and gift sets. We support both small runs and larger branded orders with a clear development process.",
          featuresTitle: "What can be customized",
          audiencesTitle: "Who this is for",
          processTitle: "How we work together",
          featureOneTitle: "Logo and naming",
          featureOneBody: "Place your own brand name and logo across labels, boxes, and gifting inserts.",
          featureTwoTitle: "Color direction",
          featureTwoBody: "Align the packaging palette, materials, and overall presentation with your visual identity.",
          featureThreeTitle: "Product selection",
          featureThreeBody: "Build gift sets, event kits, hospitality packs, or private label product lines with us.",
          audienceOne: "Corporate gifting and event kits",
          audienceTwo: "Private label orders for cafes, hotels, studios, and boutiques",
          audienceThree: "Capsule collections for personal brands and small businesses",
          stepOneTitle: "1. Brief",
          stepOneBody: "Send your brand goals, quantity, preferred products, and visual direction.",
          stepTwoTitle: "2. Direction",
          stepTwoBody: "We prepare the recommended format, packaging direction, and pricing approach.",
          stepThreeTitle: "3. Sample",
          stepThreeBody: "If needed, we validate the direction through a sample or small pilot batch.",
          stepFourTitle: "4. Production",
          stepFourBody: "Once approved, we organize production, packaging, and fulfillment.",
          ctaTitle: visibleSettings.wholesaleHeading.trim() || "Start a partnership",
          ctaBody:
            visibleSettings.wholesaleText.trim() ||
            "Share your project scope, timing, quantity, and brand direction to begin the collaboration.",
          emailCta: "Email Us",
          contactCta: "Open Contact Page",
        };

  return (
    <div className="partnerships-page">
      <section
        className={`partnerships-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="container">
          <h1>{copy.heroTitle}</h1>
          <p>{copy.heroBody}</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="partnerships-intro">
            <span>{copy.introKicker}</span>
            <h2>{copy.introTitle}</h2>
            <p>{copy.introBody}</p>
          </div>

          <div className="partnerships-grid">
            <article className="partnerships-card">
              <div className="partnerships-card-icon">
                <BadgeCheck size={22} strokeWidth={1.5} />
              </div>
              <h3>{copy.featureOneTitle}</h3>
              <p>{copy.featureOneBody}</p>
            </article>
            <article className="partnerships-card">
              <div className="partnerships-card-icon">
                <Palette size={22} strokeWidth={1.5} />
              </div>
              <h3>{copy.featureTwoTitle}</h3>
              <p>{copy.featureTwoBody}</p>
            </article>
            <article className="partnerships-card">
              <div className="partnerships-card-icon">
                <Sparkles size={22} strokeWidth={1.5} />
              </div>
              <h3>{copy.featureThreeTitle}</h3>
              <p>{copy.featureThreeBody}</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section partnerships-band">
        <div className="container partnerships-band-grid">
          <div className="partnerships-band-panel">
            <span>{copy.audiencesTitle}</span>
            <ul className="partnerships-list">
              <li>{copy.audienceOne}</li>
              <li>{copy.audienceTwo}</li>
              <li>{copy.audienceThree}</li>
            </ul>
          </div>
          <div className="partnerships-band-panel">
            <span>{copy.processTitle}</span>
            <div className="partnerships-steps">
              <div>
                <strong>{copy.stepOneTitle}</strong>
                <p>{copy.stepOneBody}</p>
              </div>
              <div>
                <strong>{copy.stepTwoTitle}</strong>
                <p>{copy.stepTwoBody}</p>
              </div>
              <div>
                <strong>{copy.stepThreeTitle}</strong>
                <p>{copy.stepThreeBody}</p>
              </div>
              <div>
                <strong>{copy.stepFourTitle}</strong>
                <p>{copy.stepFourBody}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="partnerships-cta">
        <div className="container">
          <div className="partnerships-cta-inner">
            <div>
              <span>{copy.introKicker}</span>
              <h2>{copy.ctaTitle}</h2>
              <p>{copy.ctaBody}</p>
            </div>
            <div className="partnerships-cta-actions">
              <a href={`mailto:${visibleSettings.wholesaleEmail}`} className="btn btn-primary">
                {copy.emailCta}
              </a>
              <Link to="/contact" className="btn btn-outline">
                <BriefcaseBusiness size={16} />
                {copy.contactCta}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
