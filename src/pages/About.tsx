import { Eye, Target, Award, ShieldCheck, HeartHandshake } from "lucide-react";
import aboutSavanaSoapImage from "../assets/about-savana-soap.jpg";
import womenOwnedLogo from "../assets/women-owned.png";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./About.css";

const aboutSectionCopy = {
  EN: {
    valuesHeading: "What We Believe In",
    visionHeading: "Our Vision",
    missionHeading: "Our Mission",
    coreValuesHeading: "Our Values",
    processHeading: "Our Process",
    processSubtext: "From ingredient to finished product, every step is done with care.",
    sustainability: {
      title: "Sustainable",
      body:
        "We're committed to reducing our environmental footprint. From minimal packaging to biodegradable formulas, we strive to make choices that are kind to the planet.",
    },
    vision:
      "We will create a globally recognized brand by offering skin care and household products made from Mongolian-sourced, natural ingredients.",
    mission:
      "We offer products that meet the needs and requirements of consumers with skin allergies, sensitive skin, or those seeking healthy, organic products to support their healthy lifestyle.",
    coreValues: [
      {
        title: "Back to nature",
        body: "We will manufacture our products using technology that meets international standards, and we will work responsibly and humanely throughout the production process.",
      },
      {
        title: "Honesty",
        body: "We are a manufacturer of products based on national tradition and science-based research.",
      },
      {
        title: "Care",
        body: "Бид хэрэглэгчдийнхээ амьдралын чанарыг дээшлүүлэх, мэдлэгийг түгээж, өдөр тутмын сонголтод нь эерэгээр нөлөөлөгч,хөтлөгч нь байна.",
      },
    ],
    steps: [
      {
        title: "Source",
        body:
          "We carefully select natural ingredients from trusted suppliers, prioritizing local and organic sources.",
      },
      {
        title: "Craft",
        body:
          "Each batch is handcrafted using time-tested recipes and traditional cold-process methods.",
      },
      {
        title: "Cure",
        body:
          "Our soaps are cured for 4–6 weeks, allowing them to develop their optimal hardness and mildness.",
      },
      {
        title: "Share",
        body:
          "Each product is packaged with care and shipped to you, ready to bring natural goodness to your routine.",
      },
    ],
  },
  MN: {
    valuesHeading: "Бидний үнэт зүйлс",
    visionHeading: "Алсан хараа",
    missionHeading: "Эрхэм зорилго",
    coreValuesHeading: "Үнэт зүйл",
    processHeading: "Бидний үйл явц",
    processSubtext: "Түүхий эдээс эхлээд бэлэн бүтээгдэхүүн болтол алхам бүрийг анхааралтай хийдэг.",
    sustainability: {
      title: "Тогтвортой хандлага",
      body:
        "Бид байгаль орчинд үзүүлэх нөлөөгөө бууруулахыг зорьдог. Минимал савлагаанаас эхлээд задрах боломжтой найрлага хүртэл дэлхийд ээлтэй шийдлийг сонгохыг хичээдэг.",
    },
    vision:
      "Бид Монгол орны шимт, байгалийн гаралтай түүхий эдээр үйлдвэрлэсэн арьс арчилгаа, ахуйн хэрэглээний бүтээгдэхүүнийг санал болгож, дэлхийд танигдсан брэндийг бүтээнэ.",
    mission:
      "Бид арьсны харшилтай, эмзэг арьстай эсвэл эрүүл, органик бүтээгдэхүүн хэрэглэхийг зорьж буй хэрэглэгчиддээ хэрэгцээ, шаардлагад нь нийцсэн, эрүүл амьдралын хэв маягийг нь дэмжих бүтээгдэхүүн санал болгодог.",
    coreValues: [
      {
        title: "Хүн, байгальд ээлтэй ",
        body: "Бид ОУ-ын стандартыг хангасан технологиор бүтээгдэхүүнээ үйлдвэрлэж, үйлдвэрлэлийн бүхий л дамжлагадаа хүн, байгальд ээлтэй, хариуцлагатай сонголтыг хийнэ.",
      },
      {
        title: "Найдвартай",
        body: "Бид үндэсний уламжлалт болон шинжлэх ухаанд суурилсан судалгаа шинжилгээ бүхий бүтээгдэхүүн үйлдвэрлэгч байна.",
      },
      {
        title: "Нөлөөлөгч, хөтлөгч",
        body: "Бид хэрэглэгчдийнхээ амьдралын чанарыг дээшлүүлэх, мэдлэгийг түгээж, өдөр тутмын сонголтод нь эерэгээр нөлөөлөгч,хөтлөгч нь байна.",
      },
    ],
    steps: [
      {
        title: "Сонголт",
        body:
          "Бид итгэлтэй нийлүүлэгчдээс байгалийн гаралтай түүхий эдийг нягт нямбай сонгож, боломжтой үедээ нутгийн болон органик эх үүсвэрийг давуу үздэг.",
      },
      {
        title: "Урлал",
        body:
          "Багц бүрийг туршигдсан жор, уламжлалт cold-process аргаар гараар урладаг.",
      },
      {
        title: "Боловсруулалт",
        body:
          "Манай савангууд 4–6 долоо хоног амарч, илүү хатуу, зөөлөн, хэрэглэхэд таатай чанартай болдог.",
      },
      {
        title: "Хүргэлт",
        body:
          "Бүтээгдэхүүн бүрийг анхааралтай савлаж, таны өдөр тутмын хэрэглээнд байгалийн сайн сайхныг хүргэхээр илгээдэг.",
      },
    ],
  },
} as const;

export default function About() {
  const { language, t } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const pageBanner = getPageBannerNavigationItem(visibleSettings.navigationItems, "/about");
  const hasPageBanner = Boolean(pageBanner?.pageBannerImage.trim());
  const pageBannerStyle = getPageBannerStyle(pageBanner?.pageBannerImage);
  const copy = aboutSectionCopy[language];

  return (
    <div className="about-page">
      <div
        className={`about-hero${hasPageBanner ? " has-banner" : ""}`}
        style={pageBannerStyle}
      >
        <div className="container">
          <h1>{t.aboutHeroHeading}</h1>
          <p>{t.aboutHeroSub}</p>
        </div>
      </div>

      <section className="about-intro section">
        <div className="container">
          <div className="about-intro-grid">
            <div className="about-intro-image">
              <img
                src={aboutSavanaSoapImage}
                alt={visibleSettings.aboutIntroTitle}
                className="about-image-photo"
                loading="lazy"
              />
            </div>
            <div className="about-intro-content">
              <h2>{visibleSettings.aboutIntroTitle}</h2>
              <p>{t.brandStoryBody1}</p>
              <p>{t.brandStoryBody2}</p>
              <p>{t.brandStoryBody3}</p>
              <div className="about-badge">
                <img src={womenOwnedLogo} alt="Women Owned" className="about-badge-logo" />
                <span>{t.womanOwned}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="about-values section">
        <div className="container">
          <div className="section-header">
            <h2>{copy.valuesHeading}</h2>
          </div>
          <div className="about-values-grid">
            {[
              { icon: Award, content: copy.coreValues[0] },
              { icon: ShieldCheck, content: copy.coreValues[1] },
              { icon: HeartHandshake, content: copy.coreValues[2] },
            ].map(({ icon: Icon, content }) => (
              <div key={content.title} className="about-value">
                <div className="about-value-icon">
                  <Icon size={32} strokeWidth={1.2} />
                </div>
                <h3>{content.title}</h3>
                <p>{content.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="about-vmc section">
        <div className="container">
          <div className="about-vmc-grid">
            <div className="about-vmc-card">
              <div className="about-vmc-icon">
                <Eye size={32} strokeWidth={1.2} />
              </div>
              <h3>{copy.visionHeading}</h3>
              <p>{copy.vision}</p>
            </div>
            <div className="about-vmc-card">
              <div className="about-vmc-icon">
                <Target size={32} strokeWidth={1.2} />
              </div>
              <h3>{copy.missionHeading}</h3>
              <p>{copy.mission}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-process section">
        <div className="container">
          <div className="section-header">
            <h2>{copy.processHeading}</h2>
            <p>{copy.processSubtext}</p>
          </div>
          <div className="process-steps">
            {copy.steps.map((step, index) => (
              <div key={step.title} className="process-step">
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
