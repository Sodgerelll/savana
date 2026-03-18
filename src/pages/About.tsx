import { Leaf, Heart, Sun, Sprout } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getPageBannerNavigationItem, getPageBannerStyle, getRenderableSettings } from "../lib/storefrontHelpers";
import "./About.css";

const aboutSectionCopy = {
  EN: {
    valuesHeading: "What We Believe In",
    processHeading: "Our Process",
    processSubtext: "From ingredient to finished product, every step is done with care.",
    values: [
      {
        title: "Natural Ingredients",
        body:
          "We use only plant-based oils, butters, and pure essential oils. No synthetic fragrances, no parabens, no sulfates, no artificial colors. Just honest, natural ingredients you can trust.",
      },
      {
        title: "Small Batch",
        body:
          "Every product is handcrafted in small batches, ensuring exceptional quality and consistency. We believe that the best products are made with patience and attention to detail.",
      },
      {
        title: "Mongolia Inspired",
        body:
          "Our recipes are inspired by local ingredients, practical daily care, and the clean aesthetic that defines SAVANA. We focus on products that feel simple, useful, and intentional.",
      },
      {
        title: "Sustainable",
        body:
          "We're committed to reducing our environmental footprint. From minimal packaging to biodegradable formulas, we strive to make choices that are kind to the planet.",
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
    processHeading: "Бидний үйл явц",
    processSubtext: "Түүхий эдээс эхлээд бэлэн бүтээгдэхүүн болтол алхам бүрийг анхааралтай хийдэг.",
    values: [
      {
        title: "Байгалийн найрлага",
        body:
          "Бид зөвхөн ургамлын тос, butter, цэвэр эфирийн тос ашигладаг. Синтетик үнэртэн, парабен, сульфат, хиймэл өнгө оруулагчгүй. Итгэж болох энгийн, шударга найрлагыг сонгодог.",
      },
      {
        title: "Жижиг багц",
        body:
          "Бүтээгдэхүүн бүрийг жижиг багцаар гараар урлаж, чанар ба тогтвортой байдлыг хадгалдаг. Сайн бүтээгдэхүүн тэвчээр, анхаарал хоёрын үр дүнд бий болдог гэж бид үздэг.",
      },
      {
        title: "Монгол ахуйгаас сэдэвлэсэн",
        body:
          "Манай найрлага, бүтээгдэхүүний хандлага нь нутгийн өнгө төрх, өдөр тутмын хэрэгцээ, SAVANA-г тодорхойлдог цэвэр минимал мэдрэмжээс сэдэвлэдэг. Энгийн, хэрэгцээтэй, санаатай бүтээгдсэн бүтээгдэхүүнд төвлөрдөг.",
      },
      {
        title: "Тогтвортой хандлага",
        body:
          "Бид байгаль орчинд үзүүлэх нөлөөгөө бууруулахыг зорьдог. Минимал савлагаанаас эхлээд задрах боломжтой найрлага хүртэл дэлхийд ээлтэй шийдлийг сонгохыг хичээдэг.",
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
  const aboutParagraphs = visibleSettings.aboutIntroBody.split("\n\n").filter(Boolean);
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
              <div
                className="about-image-placeholder"
                style={{ background: "linear-gradient(135deg, #e8e0d0 0%, #c8bfa8 100%)" }}
              >
                <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                  <ellipse cx="50" cy="60" rx="32" ry="22" fill="rgba(255,255,255,0.2)" />
                  <rect x="20" y="32" width="60" height="38" rx="19" fill="rgba(255,255,255,0.28)" />
                  <path d="M34 32 Q50 14 66 32" stroke="rgba(255,255,255,0.45)" strokeWidth="3" fill="none" />
                </svg>
              </div>
            </div>
            <div className="about-intro-content">
              <h2>{visibleSettings.aboutIntroTitle}</h2>
              {aboutParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
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
              { icon: Leaf, content: copy.values[0] },
              { icon: Heart, content: copy.values[1] },
              { icon: Sun, content: copy.values[2] },
              { icon: Sprout, content: copy.values[3] },
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
