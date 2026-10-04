import { Eye, Target, Award, ShieldCheck, HeartHandshake, Leaf, FlaskConical, Truck, ArrowRight } from "lucide-react";
import processStep1 from "../assets/process/step-1.jpg";
import processStep2 from "../assets/process/step-2.jpg";
import processStep3 from "../assets/process/step-3.jpg";
import processStep4 from "../assets/process/step-4.jpg";
import aboutSavanaSoapImage from "../assets/about-savana-soap.jpg";
import womenOwnedLogo from "../assets/women-owned.png";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./About.css";

const aboutSectionCopy = {
  EN: {
    valuesHeading: "What We Believe In",
    visionHeading: "Vision Statement",
    missionHeading: "Mission Statement",
    coreValuesHeading: "Our Values",
    processHeading: "Our Process",
    processSubtext: "To bring you natural, high-quality products, we follow these 4 steps.",
    sustainability: {
      title: "Sustainable",
      body:
        "We're committed to reducing our environmental footprint. From minimal packaging to biodegradable formulas, we strive to make choices that are kind to the planet.",
    },
    vision:
      "We will build a globally recognized brand offering natural, high-quality personal care and household products made from Mongolia’s pure, nature-derived ingredients.",
    mission:
      "Our mission is to develop safe, effective, and environmentally responsible products for both personal care and everyday household use. Our products are designed for consumers who value health, sustainability, and quality—supporting a lifestyle that is both clean and conscious.",
    coreValues: [
      {
        title: "Back to nature",
        body: "We are committed to producing high-quality products using internationally compliant technologies, while ensuring every step of our process respects both people and the environment.",
      },
      {
        title: "Reliable",
        body: "We are a local manufacturer developing research-based products grounded in national traditions and scientific principles.",
      },
      {
        title: "Influencer and Guide",
        body: "We share knowledge that enhances our customers’ quality of life and act as both a positive influencer and a trusted guide in their everyday choices.",
      },
    ],
    steps: [
      {
        title: "Ingredient selection",
        body: "We choose high-quality natural raw materials and carefully check each product's ingredients and intended use.",
      },
      {
        title: "Crafting",
        body: "Knowing the value of natural ingredients, we develop know-how-driven formulas and make high-quality products.",
      },
      {
        title: "Quality assurance",
        body: "We follow technology suited to every product, keep to the schedule, and guarantee quality.",
      },
      {
        title: "Packaging & delivery",
        body: "Once ready, each product is packed with care to preserve its quality, and every step to the customer gets our full attention.",
      },
    ],
  },
  MN: {
    valuesHeading: "Бидний үнэт зүйлс",
    visionHeading: "Алсын хараа",
    missionHeading: "Эрхэм зорилго",
    coreValuesHeading: "Үнэт зүйл",
    processHeading: "Бидний үйл явц",
    processSubtext: "Байгалийн гаралтай, чанартай бүтээгдэхүүн таны гарт хүрэхийн тулд бид дараах 4 үе шатыг баримталдаг.",
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
        title: "Түүхий эдийн сонголт",
        body: "Гарал үүсэл нь тодорхой, чанартай түүхий эдийг сонгон авч, бүтээгдэхүүний найрлага, зориулалттай нийцэх эсэхийг нямбай шалгадаг.",
      },
      {
        title: "Бүтээл",
        body: "Байгалийн үнэ цэнийг хадгалсан орц найрлагыг өөрсдийн мэдлэг, ноу-хаутай хослуулан чанартай бүтээгдэхүүн болгон урладаг.",
      },
      {
        title: "Чанаржуулалт",
        body: "Бүтээгдэхүүн бүрийг зохих технологи, хугацааны дагуу боловсруулж, чанарыг нь баталгаажуулдаг.",
      },
      {
        title: "Савлагаа ба хүргэлт",
        body: "Бэлэн болсон бүтээгдэхүүн бүрийг чанарыг нь хадгалахуйц байдлаар савлаж, хэрэглэгчдэд хүрэх хүртэл үйл явц бүрд анхаарал хандуулдаг.",
      },
    ],
  },
} as const;

const processImages = [processStep1, processStep2, processStep3, processStep4];
const processIcons = [Leaf, FlaskConical, ShieldCheck, Truck];

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

      <section className="about-process section">
        <div className="container">
          <div className="section-header">
            <h2>{copy.processHeading}</h2>
            <p>{copy.processSubtext}</p>
          </div>
          <div className="process-steps">
            {copy.steps.map((step, index) => {
              const Icon = processIcons[index];
              return (
                <div key={step.title} className="process-step">
                  <div className="process-photo-wrap">
                    <img src={processImages[index]} alt="" className="process-photo" loading="lazy" />
                    <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  {index < copy.steps.length - 1 && (
                    <ArrowRight className="process-arrow" size={28} strokeWidth={1.2} aria-hidden="true" />
                  )}
                  <span className="process-icon">
                    <Icon size={26} strokeWidth={1.2} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
