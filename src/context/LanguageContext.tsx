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
  bestSellers: string;
  aboutUs: string;
  findUs: string;
  contact: string;
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
  howToUse: string;
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
  bestSellers: "Best Sellers",
  aboutUs: "About Us",
  findUs: "Find Us",
  contact: "Contact",
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
  brandStoryHeading: "Small-Batch, Wild-Crafted & Made with Love",
  brandStoryBody1:
    "Every product we create starts with carefully sourced, natural ingredients. We believe that what you put on your skin matters, which is why we use only plant-based oils, locally harvested botanicals, and pure essential oils.",
  brandStoryBody2:
    "Our small-batch process ensures that each product receives the attention it deserves, resulting in handcrafted goods that are as beautiful as they are effective.",
  learnOurStory: "Learn Our Story",
  collectionsHeading: "Our Collections",
  testimonialsHeading: "What Our Customers Are Saying",
  newsletterHeading: "Join the SAVANA Community",
  newsletterSubtext:
    "Get updates on new products, seasonal collections, and SAVANA news",
  newsletterPlaceholder: "Your email address",
  subscribe: "Subscribe",
  footerBrandDesc:
    "Organic soap, solid shampoo, and wellness products made in Mongolia with thoughtful natural ingredients.",
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
  howToUse: "How to Use",
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
  loginSubtext: "Firebase email/password authentication is now connected for secure sign in and account access.",
  signIn: "Sign In",
  createAccount: "Create Account",
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
  bestSellers: "Шилдэг бараанууд",
  aboutUs: "Бидний тухай",
  findUs: "Бидний байршил",
  contact: "Холбоо барих",
  handcraftedIn: "АЛЬБЕРТА ДАХ ГАРААР ХИЙСЭН",
  heroHeading: "Прэйри сэтгэлийн байгалийн саван ба арьс халамж",
  heroSubtext: "Жижиг хэмжээний, гараар хийсэн, зэрлэг ургамал, эфирийн тосоор",
  shopNow: "ОДОО ХУДАЛДАН АВ",
  ourStory: "МАНАЙ ТҮҮХ",
  categoriesHeading: "Ангиллаар хайх",
  soap: "Саван",
  bestSellersHeading: "Хамгийн их зарагддаг",
  viewAll: "Бүгдийг харах",
  addToCart: "Сагслах",
  outOfStock: "Дууссан",
  quickAdd: "Хурдан нэмэх",
  brandStoryHeading: "Жижиг багцаар, зэрлэг ургамлаар, хайраар хийсэн",
  brandStoryBody1:
    "Бид бүтээдэг бүтээгдэхүүн бүрийг анхааралтай сонгосон байгалийн түүхий эдээс эхэлдэг. Арьсандаа тавьдаг зүйл чухал тул бид зөвхөн ургамлын тос, нутгийн ургамал, цэвэр эфирийн тос ашигладаг.",
  brandStoryBody2:
    "Жижиг багцаар хийдэг үйл явц нь бүтээгдэхүүн бүрт анхаарал тавих боломжийг олгодог бөгөөд гоё бөгөөд үр дүнтэй бүтээгдэхүүн гаргах боломжийг бүрдүүлдэг.",
  learnOurStory: "Манай түүхийг мэдэх",
  collectionsHeading: "Манай цуглуулга",
  testimonialsHeading: "Манай үйлчлүүлэгчид юу хэлж байна",
  newsletterHeading: "SAVANA нийгэмлэгт нэгдээрэй",
  newsletterSubtext:
    "Шинэ бүтээгдэхүүн, улирлын цуглуулга, SAVANA-ийн мэдээ мэдээллийг аваарай",
  newsletterPlaceholder: "Таны и-мэйл хаяг",
  subscribe: "Бүртгүүлэх",
  footerBrandDesc:
    "Монголд бүтээгдсэн органик саван, хатуу шампунь, эрүүл мэндийн бүтээгдэхүүнүүд.",
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
  continueShopping: "Үргэлжлүүлэн дэлгүүрлэх",
  cartNote: "Хүргэлтийн зардлыг захиалгын үед тооцно",
  quantity: "Тоо хэмжээ",
  ingredients: "Найрлага",
  howToUse: "Хэрхэн ашиглах",
  shippingReturns: "Хүргэлт & Буцаалт",
  youMayAlsoLike: "Таньд таалагдаж болох",
  productNotFound: "Бүтээгдэхүүн олдсонгүй",
  backToShop: "Дэлгүүр рүү буцах",
  from: "Эхлэн",
  allProducts: "Бүх бүтээгдэхүүн",
  productsCount: "бүтээгдэхүүн",
  noProducts: "Энэ цуглуулгад бүтээгдэхүүн олдсонгүй.",
  viewAllProducts: "Бүх бүтээгдэхүүнийг харах",
  aboutHeroHeading: "Манай түүх",
  aboutHeroSub: "Канадын тал нутгийн зүрхнээс таны гэрт.",
  contactHeading: "Холбоо барих",
  contactSub: "Бид тантай харилцахдаа баяртай байна. Асуулт, санал хүсэлтээ илгээнэ үү.",
  findUsHeading: "Бидний байршил",
  findUsSub: "Альберта даяарх нутгийн зах зээл, арга хэмжээнд биднийг олоорой.",
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
  loginSubtext: "Firebase email/password authentication холбогдсон тул аюулгүй нэвтрэлт, account access ашиглах боломжтой боллоо.",
  signIn: "Нэвтрэх",
  createAccount: "Бүртгэл үүсгэх",
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
