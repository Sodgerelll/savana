/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "EN" | "MN";

export interface Translations {
  // Announcement bar
  announcement1: string;
  announcement2: string;
  announcement3: string;
  // Nav
  shop: string;
  allNaturalSoap: string;
  skinCare: string;
  bodyCare: string;
  hair: string;
  lipCare: string;
  featured: string;
  bestSellers: string;
  aboutUs: string;
  locationNav: string;
  findUs: string;
  contact: string;
  journal: string;
  // Hero
  handcraftedIn: string;
  heroHeading: string;
  heroSubtext: string;
  shopNow: string;
  ourStory: string;
  // Categories
  categoriesHeading: string;
  soap: string;
  // Products / best sellers
  bestSellersHeading: string;
  viewAll: string;
  addToCart: string;
  outOfStock: string;
  quickAdd: string;
  // Brand story
  brandStoryHeading: string;
  brandStoryBody1: string;
  brandStoryBody2: string;
  learnOurStory: string;
  // Collections grid
  collectionsHeading: string;
  // Testimonials
  testimonialsHeading: string;
  // Newsletter
  newsletterHeading: string;
  newsletterSubtext: string;
  newsletterPlaceholder: string;
  subscribe: string;
  // Footer
  footerBrandDesc: string;
  footerShop: string;
  footerInfo: string;
  footerContact: string;
  footerAbout: string;
  footerPolicies: string;
  footerFAQ: string;
  footerCopyright: string;
  footerShippingReturns: string;
  footerWholesale: string;
  // Cart
  cartTitle: string;
  cartSubtotal: string;
  checkout: string;
  cartEmpty: string;
  continueShopping: string;
  cartNote: string;
  // Product detail
  quantity: string;
  ingredients: string;
  usage: string;
  howToUse: string;
  caution: string;
  shelfLife: string;
  shippingReturns: string;
  youMayAlsoLike: string;
  productNotFound: string;
  backToShop: string;
  from: string;
  // Collections page
  allProducts: string;
  productsCount: string;
  noProducts: string;
  viewAllProducts: string;
  // Pages
  aboutHeroHeading: string;
  aboutHeroSub: string;
  contactHeading: string;
  contactSub: string;
  findUsHeading: string;
  findUsSub: string;
  // Contact form
  sendMessage: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  subjectPlaceholder: string;
  messagePlaceholder: string;
  sendBtn: string;
  sendingMessage: string;
  messageSentSuccess: string;
  messageSendFailed: string;
  messageFormValidationError: string;
  // Find Us
  ourLocation: string;
  visitUs: string;
  marketSchedule: string;
  storeHours: string;
  // Search
  searchPlaceholder: string;
  // Auth
  account: string;
  login: string;
  logout: string;
  password: string;
  confirmPassword: string;
  passwordPlaceholder: string;
  confirmPasswordPlaceholder: string;
  loginHeading: string;
  loginSubtext: string;
  signIn: string;
  createAccount: string;
  signInWithGoogle: string;
  continueAsGuest: string;
  phoneNumber: string;
  phoneNumberPlaceholder: string;
  verificationCode: string;
  verificationCodePlaceholder: string;
  sendVerificationCode: string;
  verifyCode: string;
  resendCode: string;
  useDifferentPhone: string;
  orContinueWith: string;
  orContinueWithPhone: string;
  phoneCodeSent: string;
  phoneCodeSentHelp: string;
  guestSessionActive: string;
  noAccount: string;
  haveAccount: string;
  authLoading: string;
  loginToCheckout: string;
  accountHeading: string;
  accountSubtext: string;
  signedInAs: string;
  authStatus: string;
  authenticated: string;
  memberSince: string;
  openCart: string;
}

const en: Translations = {
  announcement1: "Free shipping on orders over $75 CAD",
  announcement2: "Bundle + save! Buy 5+ bars and get 17% off",
  announcement3: "Purchase 4+ lip balms and get 17% off!",
  shop: "Shop",
  allNaturalSoap: "All Natural Soap",
  skinCare: "Skin Care",
  bodyCare: "Body Care",
  hair: "Hair",
  lipCare: "Lip Care",
  featured: "Featured",
  bestSellers: "Best Sellers",
  aboutUs: "About Us",
  locationNav: "Location",
  findUs: "Find Us",
  contact: "Contact",
  journal: "Journal",
  handcraftedIn: "HANDCRAFTED IN ALBERTA",
  heroHeading: "Natural Soap & Skincare for the Prairie Soul",
  heroSubtext: "Small-batch, handcrafted with wildcrafted botanicals and essential oils",
  shopNow: "SHOP NOW",
  ourStory: "OUR STORY",
  categoriesHeading: "Shop by Category",
  soap: "Soap",
  bestSellersHeading: "Best Sellers",
  viewAll: "View All",
  addToCart: "Add to Cart",
  outOfStock: "Out of Stock",
  quickAdd: "Quick Add",
  brandStoryHeading: "Handcrafted with Nature, Made in Mongolia",
  brandStoryBody1:
    "Savana Organica LLC has been producing eco-friendly, zero-waste organic beauty, household cleaning and traditional medicine-based health products that meet international standards for 7 years.",
  brandStoryBody2:
    "We use juniper, thyme, nettle, sea buckthorn oil, Shuden mountain rock salt, natural soda, honey, purified tallow, lard, and ghee from Mongolian pasture livestock to handcraft each product with care and dedication.",
  learnOurStory: "Learn Our Story",
  collectionsHeading: "Our Collections",
  testimonialsHeading: "What Our Customers Are Saying",
  newsletterHeading: "Join the SAVANA Community",
  newsletterSubtext:
    "Get updates on new products, seasonal collections, and SAVANA news",
  newsletterPlaceholder: "Your email address",
  subscribe: "Subscribe",
  footerBrandDesc:
    "Eco-friendly organic beauty, household cleaning, and traditional wellness products. Handcrafted in Mongolia since 2019.",
  footerShop: "Shop",
  footerInfo: "Info",
  footerContact: "Contact",
  footerAbout: "About Us",
  footerPolicies: "Policies",
  footerFAQ: "FAQ",
  footerCopyright: "SAVANA. All rights reserved.",
  footerShippingReturns: "Shipping & Returns",
  footerWholesale: "Wholesale",
  cartTitle: "Cart",
  cartSubtotal: "Subtotal",
  checkout: "Checkout",
  cartEmpty: "Your cart is empty",
  continueShopping: "Continue Shopping",
  cartNote: "Shipping calculated at checkout",
  quantity: "Quantity",
  ingredients: "Ingredients",
  usage: "Usage",
  howToUse: "How to Use",
  caution: "Caution",
  shelfLife: "Shelf Life",
  shippingReturns: "Shipping & Returns",
  youMayAlsoLike: "You May Also Like",
  productNotFound: "Product not found",
  backToShop: "Back to Shop",
  from: "From",
  allProducts: "All Products",
  productsCount: "products",
  noProducts: "No products found in this collection.",
  viewAllProducts: "View All Products",
  aboutHeroHeading: "Our Story",
  aboutHeroSub: "From Mongolia to your home.",
  contactHeading: "Contact Us",
  contactSub: "We'd love to hear from you. Get in touch with any questions or feedback.",
  findUsHeading: "Find Us",
  findUsSub: "Find SAVANA through our official channels and delivery information.",
  sendMessage: "Send Us a Message",
  name: "Name",
  email: "Email",
  subject: "Subject",
  message: "Message",
  namePlaceholder: "Your name",
  emailPlaceholder: "Your email",
  subjectPlaceholder: "What's this about?",
  messagePlaceholder: "Your message...",
  sendBtn: "Send Message",
  sendingMessage: "Sending...",
  messageSentSuccess: "Your message has been sent. We'll get back to you soon.",
  messageSendFailed: "Unable to send your message right now. Please try again.",
  messageFormValidationError: "Please complete all fields before sending your message.",
  ourLocation: "Our Location",
  visitUs: "Visit Us",
  marketSchedule: "Market Schedule",
  storeHours: "Store Hours",
  searchPlaceholder: "Search our store...",
  account: "Account",
  login: "Login",
  logout: "Logout",
  password: "Password",
  confirmPassword: "Confirm Password",
  passwordPlaceholder: "Enter your password",
  confirmPasswordPlaceholder: "Repeat your password",
  loginHeading: "Login and continue with your Savana session",
  loginSubtext: "Use phone number and password, Gmail, guest access, or email/password to continue securely.",
  signIn: "Sign In",
  createAccount: "Create Account",
  signInWithGoogle: "Continue with Google",
  continueAsGuest: "Continue as Guest",
  phoneNumber: "Phone Number",
  phoneNumberPlaceholder: "+97699112233",
  verificationCode: "Verification Code",
  verificationCodePlaceholder: "Enter the 6-digit code",
  sendVerificationCode: "Send Code",
  verifyCode: "Verify and Continue",
  resendCode: "Resend Code",
  useDifferentPhone: "Use Different Number",
  orContinueWith: "or continue with",
  orContinueWithPhone: "or use phone number and password",
  phoneCodeSent: "Verification code sent.",
  phoneCodeSentHelp: "Enter the SMS code to finish signing in.",
  guestSessionActive: "Guest session is active. You can continue shopping or switch to a full account.",
  noAccount: "Don't have an account?",
  haveAccount: "Already have an account?",
  authLoading: "Processing...",
  loginToCheckout: "Login to Checkout",
  accountHeading: "My Account",
  accountSubtext: "Manage your session and continue from cart to the next order step.",
  signedInAs: "Signed in as",
  authStatus: "Status",
  authenticated: "Authenticated",
  memberSince: "Member since",
  openCart: "Open Cart",
};

const mn: Translations = {
  announcement1: "75 CAD-аас дээш захиалгад үнэгүй хүргэлт",
  announcement2: "Багцаар авч хэмнээрэй! 5+ бар авбал 17% хямдрал",
  announcement3: "4+ уруулын бальзам авбал 17% хямдрал авна!",
  shop: "Дэлгүүр",
  allNaturalSoap: "Бүх байгалийн саван",
  skinCare: "Арьсны тусламж",
  bodyCare: "Биеийн тусламж",
  hair: "Үс",
  lipCare: "Уруулын тусламж",
  featured: "Эрэлттэй",
  bestSellers: "Шилдэг бүтээгдэхүүн",
  aboutUs: "Бидний тухай",
  locationNav: "Байршил",
  findUs: "Бидний байршил",
  contact: "Холбоо барих",
  journal: "Сэтгүүл",
  handcraftedIn: "АЛЬБЕРТА ДАХ ГАРААР ХИЙСЭН",
  heroHeading: "Прэйри сэтгэлийн байгалийн саван ба арьс халамж",
  heroSubtext: "Жижиг хэмжээний, гараар хийсэн, зэрлэг ургамал, эфирийн тосоор",
  shopNow: "Худалдан авах",
  ourStory: "МАНАЙ ТҮҮХ",
  categoriesHeading: "Ангиллаар хайх",
  soap: "Саван",
  bestSellersHeading: "Эрэлттэй бүтээгдэхүүнүүд",
  viewAll: "Бүгдийг харах",
  addToCart: "Сагслах",
  outOfStock: "Дууссан",
  quickAdd: "Хурдан нэмэх",
  brandStoryHeading: "Байгалиас гаралтай, Монголд бүтээгдсэн",
  brandStoryBody1:
    "Савана органика ХХК нь байгальд ээлтэй, хог хаягдалгүй органик гоо сайхан, ахуйн цэвэрлэгээний болон уламжлалт анагаах ухаанд суурилсан эрүүл мэндийг дэмжих, ОУ-ын стандартад нийцсэн чанартай бүтээгдэхүүнийг 7 жилийн турш хэрэглэгчиддээ үйлдвэрлэн хүргэсээр байна.",
  brandStoryBody2:
    "Бид Монгол орны хөрсөнд ургасан арц, ганга, халгай, чацаргана жимсний охь тос, шүдэн уулын жамц давс, байгалийн цэвэр хужир, зөгийн бал, Монгол бэлчээрийн малын цэвэршүүлсэн сүүлэн тос, өөхөн тос, шар тосыг ашиглан бүтээгдэхүүн нэг бүрийг гар аргаар сэтгэлээ шингээн үйлдвэрлэдэг.",
  learnOurStory: "Бидний тухай",
  collectionsHeading: "Манай цуглуулга",
  testimonialsHeading: "Хэрэглэгчдийн сэтгэгдэл",
  newsletterHeading: "SAVANA нийгэмлэгт нэгдээрэй",
  newsletterSubtext:
    "Шинэ бүтээгдэхүүн, улирлын цуглуулга, SAVANA-ийн мэдээ мэдээллийг аваарай",
  newsletterPlaceholder: "Таны и-мэйл хаяг",
  subscribe: "Бүртгүүлэх",
  footerBrandDesc:
    "Байгальд ээлтэй органик гоо сайхан, ахуйн цэвэрлэгээний болон уламжлалт анагаах ухаанд суурилсан бүтээгдэхүүн. Since 2019.",
  footerShop: "Дэлгүүр",
  footerInfo: "Мэдээлэл",
  footerContact: "Холбоо барих",
  footerAbout: "Бидний тухай",
  footerPolicies: "Бодлого",
  footerFAQ: "Түгээмэл асуулт",
  footerCopyright: "SAVANA. Бүх эрх хуулиар хамгаалагдсан.",
  footerShippingReturns: "Хүргэлт & Буцаалт",
  footerWholesale: "Бөөний худалдаа",
  cartTitle: "Сагс",
  cartSubtotal: "Нийт үнэ",
  checkout: "Захиалга хийх",
  cartEmpty: "Сагс хоосон байна",
  continueShopping: "Дэлгүүрлүү буцах",
  cartNote: "Хүргэлтийн зардлыг захиалгын үед тооцно",
  quantity: "Тоо хэмжээ",
  ingredients: "Найрлага",
  usage: "Үйлчилгээ",
  howToUse: "Хэрэглэх заавар",
  caution: "Анхаар зүйлс",
  shelfLife: "Хадгалах хугацаа",
  shippingReturns: "Хүргэлт & Буцаалт",
  youMayAlsoLike: "Таньд таалагдаж болох",
  productNotFound: "Бүтээгдэхүүн олдсонгүй",
  backToShop: "Дэлгүүр рүү буцах",
  from: "Эхлэн",
  allProducts: "Бүх бүтээгдэхүүн",
  productsCount: "бүтээгдэхүүн",
  noProducts: "Энэ цуглуулгад бүтээгдэхүүн олдсонгүй.",
  viewAllProducts: "Бүх бүтээгдэхүүнийг харах",
  aboutHeroHeading: "Бидний түүх",
  aboutHeroSub: "Байгальд ээлтэй, хог хаягдалгүй органик бүтээгдэхүүн.",
  contactHeading: "Холбоо барих",
  contactSub: "Бид тантай харилцахдаа баяртай байна. Асуулт, санал хүсэлтээ илгээнэ үү.",
  findUsHeading: "Бидний байршил",
  findUsSub: "",
  sendMessage: "Бидэнд мессеж илгээх",
  name: "Нэр",
  email: "И-мэйл",
  subject: "Сэдэв",
  message: "Мессеж",
  namePlaceholder: "Таны нэр",
  emailPlaceholder: "Таны и-мэйл",
  subjectPlaceholder: "Юуны тухай?",
  messagePlaceholder: "Таны мессеж...",
  sendBtn: "Мессеж илгээх",
  sendingMessage: "Илгээж байна...",
  messageSentSuccess: "Таны мессеж амжилттай илгээгдлээ. Баярлалаа.",
  messageSendFailed: "Одоогоор мессеж илгээж чадсангүй. Дахин оролдоно уу.",
  messageFormValidationError: "Мессеж илгээхээс өмнө бүх талбарыг бөглөнө үү.",
  ourLocation: "Манай байршил",
  visitUs: "Биднийг зочлоорой",
  marketSchedule: "Зах зээлийн хуваарь",
  storeHours: "Дэлгүүрийн цагийн хуваарь",
  searchPlaceholder: "Дэлгүүрт хайх...",
  account: "Бүртгэл",
  login: "Нэвтрэх",
  logout: "Гарах",
  password: "Нууц үг",
  confirmPassword: "Нууц үг давтах",
  passwordPlaceholder: "Нууц үгээ оруулна уу",
  confirmPasswordPlaceholder: "Нууц үгээ дахин оруулна уу",
  loginHeading: "Savana системд нэвтэрч сешнээ үргэлжлүүлнэ үү",
  loginSubtext: "Утасны дугаар, нууц үг, Gmail, guest access эсвэл и-мэйл/нууц үгээр аюулгүй нэвтэрч үргэлжлүүлнэ үү.",
  signIn: "Нэвтрэх",
  createAccount: "Бүртгэл үүсгэх",
  signInWithGoogle: "Google-ээр үргэлжлүүлэх",
  continueAsGuest: "Зочноор үргэлжлүүлэх",
  phoneNumber: "Утасны дугаар",
  phoneNumberPlaceholder: "+97699112233",
  verificationCode: "Баталгаажуулах код",
  verificationCodePlaceholder: "6 оронтой кодоо оруулна уу",
  sendVerificationCode: "Код илгээх",
  verifyCode: "Баталгаажуулаад үргэлжлүүлэх",
  resendCode: "Код дахин илгээх",
  useDifferentPhone: "Өөр дугаар ашиглах",
  orContinueWith: "эсвэл дараахаар үргэлжлүүлэх",
  orContinueWithPhone: "эсвэл утасны дугаар, нууц үг ашиглах",
  phoneCodeSent: "Баталгаажуулах код илгээгдлээ.",
  phoneCodeSentHelp: "SMS-ээр ирсэн кодыг оруулж нэвтрэлтээ дуусгана уу.",
  guestSessionActive: "Зочин сешн идэвхтэй байна. Та дэлгүүрлэж үргэлжлүүлэх эсвэл бүрэн бүртгэл рүү шилжиж болно.",
  noAccount: "Бүртгэлгүй юу?",
  haveAccount: "Бүртгэлтэй юу?",
  authLoading: "Боловсруулж байна...",
  loginToCheckout: "Захиалга хийхийн тулд нэвтэр",
  accountHeading: "Миний бүртгэл",
  accountSubtext: "Сешнээ удирдаж, сагсаас дараагийн захиалгын алхам руу шилжинэ үү.",
  signedInAs: "Нэвтэрсэн хаяг",
  authStatus: "Төлөв",
  authenticated: "Баталгаажсан",
  memberSince: "Гишүүн болсон огноо",
  openCart: "Сагс нээх",
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = "savana.language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") {
      return "MN";
    }

    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage === "EN" || storedLanguage === "MN" ? storedLanguage : "MN";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }, [language]);

  const t = language === "EN" ? en : mn;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
