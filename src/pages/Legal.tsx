import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import { getRenderableSettings } from "../lib/storefrontHelpers";
import "./Legal.css";

export type LegalDocument = "privacy" | "terms";

interface Section {
  heading: string;
  /** Paragraphs; a leading "- " turns the line into a bullet. */
  body: string[];
}

/**
 * Privacy policy and terms of service.
 *
 * The privacy text describes what this codebase actually does — the accounts it
 * creates, the order and chat records it writes, and the processors those reach
 * (Firebase, Gemini, Meta, Bonum, Vercel, Google Analytics). Keep it in step
 * with the code: a policy that describes a system you no longer run is worse
 * than none, and Meta reviews this page before approving the app.
 *
 * Contact details and the shop name come from storefront settings so the page
 * cannot drift out of date when those change.
 */
function buildSections(
  document: LegalDocument,
  language: "MN" | "EN",
  shop: { brandName: string; contactEmail: string; contactPhone: string; location: string },
): Section[] {
  const email = shop.contactEmail || "—";
  const phone = shop.contactPhone || "—";
  const name = shop.brandName || "SAVANA";

  if (document === "privacy") {
    return language === "MN"
      ? [
          {
            heading: "1. Бид ямар мэдээлэл цуглуулдаг вэ",
            body: [
              "**Бүртгэл.** Имэйл хаяг, утасны дугаар, нэр. Google эсвэл Facebook-ээр нэвтэрвэл тухайн үйлчилгээнээс таны нэр, имэйл, профайл зураг ирнэ.",
              "**Захиалга.** Хүлээн авагчийн нэр, утас, имэйл, хүргэлтийн хаяг (дүүрэг, хороо, гудамж, нэмэлт тайлбар), захиалсан бүтээгдэхүүн, таны бичсэн тэмдэглэл.",
              "**Холбоо барих маягт.** Нэр, имэйл, гарчиг, мессеж.",
              "**Чат.** Messenger, Instagram эсвэл вэбсайтын чатаар бичсэн мессеж, илгээсэн зураг, тухайн сүлжээн дэх таны ID болон нийтийн профайл нэр. Захиалга өгөх үед чатаас таны нэр, утасны дугаарыг тэмдэглэн авдаг.",
              "**Техникийн.** Хандалтын ерөнхий статистик (Google Analytics), spam-аас хамгаалах зорилгоор түр хугацаанд IP хаяг.",
            ],
          },
          {
            heading: "2. Юунд ашигладаг вэ",
            body: [
              "- Захиалгыг хүлээн авах, бэлтгэх, хүргэх",
              "- Төлбөр баталгаажуулах",
              "- Таны асуултад хариулах (чат, утас, имэйл)",
              "- Бүртгэлтэй хэрэглэгчид захиалгынхаа түүхийг харуулах",
              "- Дэлгүүрийн ажиллагааг сайжруулах (нэгтгэсэн статистик)",
              "Бид таны мэдээллийг зар сурталчилгааны зорилгоор гуравдагч этгээдэд зардаггүй.",
            ],
          },
          {
            heading: "3. Хиймэл оюунтай холбоотой мэдэгдэл",
            body: [
              "Манай чатын хариултыг Google-ийн Gemini загвар боловсруулдаг. Та чатаар бичсэн мессеж болон илгээсэн зураг хариу үүсгэх зорилгоор Google-ийн серверт дамждаг.",
              "Чатын урьдчилсан мэдээлэлд (prompt) **бүтээгдэхүүний каталог, түгээмэл асуулт, дэлгүүрийн нийтийн мэдээлэл** л ордог. Бусад хэрэглэгчийн захиалга, хувийн мэдээлэл хэзээ ч ордоггүй.",
              "Бот эмнэлгийн онош тавихгүй. Арьсны ноцтой асуудалд эмчид хандана уу.",
              "Хүссэн үедээ «ажилтантай ярих» гэж бичээд хүнтэй холбогдоно.",
            ],
          },
          {
            heading: "4. Мэдээлэл хуваалцдаг талууд",
            body: [
              "Үйлчилгээ үзүүлэхэд зайлшгүй шаардлагатай хэмжээгээр дараах үйлчилгээ үзүүлэгчид ашигладаг:",
              "- **Google Firebase** — бүртгэл, өгөгдлийн сан, файл хадгалалт",
              "- **Google Gemini** — чатын хариу боловсруулах",
              "- **Meta (Facebook, Instagram)** — тэдгээр сувгаар бичсэн үед",
              "- **Bonum** — төлбөр тооцоо",
              "- **Vercel** — вэбсайтын хостинг",
              "- **Google Analytics** — хандалтын статистик",
              "Хууль ёсны шаардлагаар эрх бүхий байгууллагад мэдээлэл өгөх шаардлага гарч болно.",
            ],
          },
          {
            heading: "5. Төлбөрийн мэдээлэл",
            body: [
              "Картын дугаар, нууц үг зэрэг төлбөрийн эмзэг мэдээллийг бид **хадгалдаггүй, хардаггүй.** Төлбөрийг Bonum бүрэн боловсруулна.",
              "Бидний тал дээр зөвхөн гүйлгээний дугаар, дүн, огноо, төлөв үлддэг.",
            ],
          },
          {
            heading: "6. Хэр удаан хадгалдаг вэ",
            body: [
              "- Захиалга, борлуулалтын бүртгэл — нягтлан бодох бүртгэлийн шаардлагын дагуу",
              "- Чатын яриа — админ устгах хүртэл",
              "- Техникийн түр бүртгэл (давхардал шалгах, хандалтын хязгаар) — автоматаар 24 цагийн дотор устдаг",
            ],
          },
          {
            heading: "7. Мэдээллээ устгуулах",
            body: [
              `Бүртгэл, захиалгын түүх, чатын яриагаа устгуулахыг хүсвэл **${email}** хаягаар хүсэлт илгээнэ үү. Хүсэлтийг 30 хоногийн дотор шийдвэрлэнэ.`,
              "Хүсэлт илгээхдээ бүртгэлтэй имэйл эсвэл утасны дугаараа заана уу.",
              "Нягтлан бодох бүртгэлийн хуулиар хадгалах шаардлагатай баримтыг хууль зөвшөөрөх хүртэл хадгална.",
              "Facebook эсвэл Instagram-аар бичсэн яриагаа устгуулах бол мөн энэ хаягаар хандана уу.",
            ],
          },
          {
            heading: "8. Таны эрх",
            body: [
              "- Өөрийн тухай хадгалагдаж буй мэдээллийг асуух",
              "- Буруу мэдээллийг засуулах",
              "- Устгуулахыг хүсэх (дээрх 7-р зүйл)",
              "- Бүртгэлээ хаах",
            ],
          },
          {
            heading: "9. Холбоо барих",
            body: [
              `${name}`,
              shop.location ? `Хаяг: ${shop.location}` : "",
              `Имэйл: ${email}`,
              `Утас: ${phone}`,
            ].filter(Boolean),
          },
        ]
      : [
          {
            heading: "1. What we collect",
            body: [
              "**Account.** Email address, phone number and name. Signing in with Google or Facebook also passes us the name, email and profile picture held by that service.",
              "**Orders.** Recipient name, phone, email, delivery address (district, khoroo, street, extra notes), the items ordered and any note you write.",
              "**Contact form.** Name, email, subject and message.",
              "**Chat.** Messages and photos you send on Messenger, Instagram or the website chat, together with your ID and public profile name on that network. When you place an order in chat we record the name and phone number you give.",
              "**Technical.** Aggregate visit statistics (Google Analytics) and, briefly, your IP address for abuse protection.",
            ],
          },
          {
            heading: "2. How we use it",
            body: [
              "- Taking, preparing and delivering your order",
              "- Confirming payment",
              "- Answering your questions by chat, phone or email",
              "- Showing registered customers their own order history",
              "- Improving the shop through aggregate statistics",
              "We do not sell your information to third parties for advertising.",
            ],
          },
          {
            heading: "3. AI disclosure",
            body: [
              "Our chat replies are generated by Google's Gemini model. Messages and photos you send in chat are transmitted to Google in order to produce a reply.",
              "The information given to the model covers **the product catalogue, frequently asked questions and public shop details only**. Other customers' orders and personal data are never included.",
              "The assistant does not give medical diagnoses. Please see a doctor for any serious skin condition.",
              'You can reach a person at any time by writing "talk to staff".',
            ],
          },
          {
            heading: "4. Who we share it with",
            body: [
              "Only as far as running the service requires, we use these providers:",
              "- **Google Firebase** — accounts, database and file storage",
              "- **Google Gemini** — generating chat replies",
              "- **Meta (Facebook, Instagram)** — when you write on those channels",
              "- **Bonum** — payment processing",
              "- **Vercel** — website hosting",
              "- **Google Analytics** — visit statistics",
              "We may have to disclose information to authorities where the law requires it.",
            ],
          },
          {
            heading: "5. Payment details",
            body: [
              "We never see or store card numbers or payment passwords. Bonum processes payments in full.",
              "Only the transaction reference, amount, date and status remain on our side.",
            ],
          },
          {
            heading: "6. How long we keep it",
            body: [
              "- Order and sales records — as accounting rules require",
              "- Chat conversations — until an administrator deletes them",
              "- Temporary technical records (duplicate checks, rate limits) — deleted automatically within 24 hours",
            ],
          },
          {
            heading: "7. Deleting your data",
            body: [
              `To have your account, order history or chat conversations deleted, email **${email}**. We answer within 30 days.`,
              "Please quote the email address or phone number your account uses.",
              "Records that accounting law requires us to keep are held until the law allows their deletion.",
              "The same address handles deletion requests for conversations held on Facebook or Instagram.",
            ],
          },
          {
            heading: "8. Your rights",
            body: [
              "- Ask what we hold about you",
              "- Have incorrect information corrected",
              "- Request deletion (section 7)",
              "- Close your account",
            ],
          },
          {
            heading: "9. Contact",
            body: [
              `${name}`,
              shop.location ? `Address: ${shop.location}` : "",
              `Email: ${email}`,
              `Phone: ${phone}`,
            ].filter(Boolean),
          },
        ];
  }

  return language === "MN"
    ? [
        {
          heading: "1. Ерөнхий зүйл",
          body: [
            `Энэ нөхцөл нь ${name} онлайн дэлгүүрийг ашиглахад хамаарна. Сайтыг ашигласнаар та эдгээр нөхцөлийг хүлээн зөвшөөрсөнд тооцно.`,
          ],
        },
        {
          heading: "2. Захиалга",
          body: [
            "Захиалга нь бидний зүгээс баталгаажсан үед хүчин төгөлдөр болно.",
            "Бүтээгдэхүүний үлдэгдэл дуусах, үнэ буруу тавигдсан зэрэг тохиолдолд бид захиалгыг цуцалж, төлбөрийг бүтэн буцаах эрхтэй.",
            "Захиалгын явцыг бүртгэлдээ нэвтэрч, эсвэл захиалгын дугаараар хайж харна.",
          ],
        },
        {
          heading: "3. Үнэ ба төлбөр",
          body: [
            "Бүх үнэ Монгол төгрөгөөр (₮) илэрхийлэгдэнэ.",
            "Төлбөрийг Bonum-ийн QR-аар хийнэ. Төлбөр баталгаажсаны дараа захиалга бэлтгэлд орно.",
            "Хүргэлтийн төлбөр захиалгын нийлбэрт тусад нь нэмэгдэнэ.",
          ],
        },
        {
          heading: "4. Хүргэлт",
          body: [
            "Улаанбаатар хотын дотор хүргэнэ. Хугацаа нь захиалгын ачаалал, байршлаас хамаарна.",
            "Хаяг буруу, эсвэл хүлээн авагч холбогдохгүйгээс үүдэн хүргэлт саатсан тохиолдолд хариуцлагыг захиалагч хүлээнэ.",
          ],
        },
        {
          heading: "5. Буцаалт",
          body: [
            "Гоо сайхны бүтээгдэхүүний онцлогоос шалтгаалж, савлагаа задлаагүй, ашиглаагүй бүтээгдэхүүнийг хүлээн авснаас хойш тохиролцсон хугацаанд буцаана.",
            "Гэмтэлтэй, эсвэл захиалгаас өөр бүтээгдэхүүн ирсэн тохиолдолд бид солих буюу төлбөрийг буцаана.",
            "Буцаалтын хүсэлтээ доорх холбоо барих хаягаар илгээнэ үү.",
          ],
        },
        {
          heading: "6. Бүтээгдэхүүний мэдээлэл",
          body: [
            "Манай бүтээгдэхүүн бол **гоо сайхны бүтээгдэхүүн, эм биш.** Өвчин эмчлэх зорилгоор бүтээгдээгүй.",
            "Найрлагыг сайтад бүрэн жагсаасан. Харшилтай бол хэрэглэхээсээ өмнө найрлагыг шалгаж, шаардлагатай бол эмчээсээ зөвлөгөө аваарай.",
            "Гар аргаар үйлдвэрлэдэг тул өнгө, үнэр, хэлбэрт бага зэргийн ялгаа гарч болно.",
          ],
        },
        {
          heading: "7. Чат ба AI туслах",
          body: [
            "Чатын хариултыг хиймэл оюун боловсруулдаг тул алдаа гарах боломжтой. Үнэ, үлдэгдэл, хүргэлтийн эцсийн мэдээллийг захиалга баталгаажих үед шалгана уу.",
            "Хиймэл оюуны хариулт нь эмнэлгийн болон мэргэжлийн зөвлөгөө биш.",
            "Хүссэн үедээ ажилтантай холбогдох боломжтой.",
          ],
        },
        {
          heading: "8. Оюуны өмч",
          body: [
            `Сайт дээрх зураг, текст, лого, дизайн нь ${name}-д хамаарах бөгөөд зөвшөөрөлгүй ашиглахыг хориглоно.`,
          ],
        },
        {
          heading: "9. Нөхцөл өөрчлөх",
          body: [
            "Бид энэ нөхцөлийг шинэчилж болно. Шинэчилсэн хувилбар нь сайтад нийтлэгдсэн өдрөөс хүчин төгөлдөр болно.",
          ],
        },
        {
          heading: "10. Холбоо барих",
          body: [`${name}`, shop.location ? `Хаяг: ${shop.location}` : "", `Имэйл: ${email}`, `Утас: ${phone}`].filter(
            Boolean,
          ),
        },
      ]
    : [
        {
          heading: "1. General",
          body: [
            `These terms apply to the ${name} online shop. By using the site you accept them.`,
          ],
        },
        {
          heading: "2. Orders",
          body: [
            "An order becomes binding once we confirm it.",
            "We may cancel an order and refund it in full where stock has run out or a price was listed in error.",
            "You can follow an order by signing in, or by searching for its order number.",
          ],
        },
        {
          heading: "3. Prices and payment",
          body: [
            "All prices are in Mongolian tugrik (₮).",
            "Payment is made through the Bonum QR code. Preparation begins once payment is confirmed.",
            "Delivery is charged separately on top of the order total.",
          ],
        },
        {
          heading: "4. Delivery",
          body: [
            "We deliver within Ulaanbaatar. Timing depends on order volume and location.",
            "Where delivery is delayed because an address was wrong or the recipient could not be reached, the customer carries that cost.",
          ],
        },
        {
          heading: "5. Returns",
          body: [
            "Because these are cosmetics, we accept returns of unopened, unused products within the agreed period after delivery.",
            "If a product arrives damaged or is not what you ordered, we replace it or refund you.",
            "Send return requests to the contact address below.",
          ],
        },
        {
          heading: "6. Product information",
          body: [
            "Our products are **cosmetics, not medicines.** They are not made to treat any condition.",
            "Full ingredient lists are published on the site. If you have allergies, check them before use and consult your doctor where needed.",
            "Because everything is handmade, small variations in colour, scent and shape are normal.",
          ],
        },
        {
          heading: "7. Chat and the AI assistant",
          body: [
            "Chat replies are generated by AI and can be wrong. Please confirm price, stock and delivery details when the order is confirmed.",
            "AI answers are not medical or professional advice.",
            "You can reach a person at any time.",
          ],
        },
        {
          heading: "8. Intellectual property",
          body: [
            `The images, text, logo and design on this site belong to ${name} and may not be used without permission.`,
          ],
        },
        {
          heading: "9. Changes",
          body: [
            "We may update these terms. A revised version takes effect on the day it is published on the site.",
          ],
        },
        {
          heading: "10. Contact",
          body: [`${name}`, shop.location ? `Address: ${shop.location}` : "", `Email: ${email}`, `Phone: ${phone}`].filter(
            Boolean,
          ),
        },
      ];
}

/** Renders **bold** spans; the copy uses no other inline markup. */
function renderLine(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default function Legal({ document }: { document: LegalDocument }) {
  const { language } = useLanguage();
  const { settings } = useStorefront();
  const visibleSettings = getRenderableSettings(settings);
  const isMn = language === "MN";

  const shop = {
    brandName: visibleSettings.brandName,
    contactEmail: visibleSettings.contactEmail,
    contactPhone: visibleSettings.contactPhone,
    location: visibleSettings.location,
  };

  const title =
    document === "privacy"
      ? isMn
        ? "Нууцлалын бодлого"
        : "Privacy Policy"
      : isMn
        ? "Үйлчилгээний нөхцөл"
        : "Terms of Service";

  const intro =
    document === "privacy"
      ? isMn
        ? "Бид ямар мэдээлэл цуглуулж, юунд ашиглаж, хэрхэн хамгаалдгаа энд тайлбарлав."
        : "What we collect, what we use it for, and how we look after it."
      : isMn
        ? "Манай онлайн дэлгүүрийг ашиглах нөхцөл."
        : "The terms that apply to using our online shop.";

  const sections = buildSections(document, isMn ? "MN" : "EN", shop);

  return (
    <div className="legal-page">
      <section className="section">
        <div className="container legal-container">
          <header className="legal-head">
            <p className="legal-kicker">{isMn ? "Хуулийн мэдээлэл" : "Legal"}</p>
            <h1>{title}</h1>
            <p>{intro}</p>
          </header>

          {sections.map((section) => (
            <article key={section.heading} className="legal-section">
              <h2>{section.heading}</h2>
              {section.body.map((line, index) =>
                line.startsWith("- ") ? (
                  <p key={index} className="legal-bullet">
                    {renderLine(line.slice(2))}
                  </p>
                ) : (
                  <p key={index}>{renderLine(line)}</p>
                ),
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
