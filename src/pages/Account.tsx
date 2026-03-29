import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Images,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquareQuote,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Store,
  Trash2,
  UserCircle2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStorefront } from "../context/StorefrontContext";
import { useLanguage } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import type { Collection, EntityStatus, Product } from "../data/products";
import {
  cloneShopSettings,
  type HeroBanner,
  type JournalEntry,
  type MarketItem,
  type ShopSettings,
  type SiteNavigationItem,
  type Testimonial,
} from "../data/storefront";
import {
  resolveUserRole,
  subscribeToUserProfiles,
  updateUserProfileByPrivileged,
  type UserAuthMethod,
  type UserProfile,
  type UserRole,
} from "../lib/userProfiles";
import { subscribeToContactMessages, type ContactMessageRecord } from "../lib/contactMessages";
import { subscribeToOrders, subscribeToUserOrders, updateOrderByAdmin, type OrderRecord, type OrderStatus } from "../lib/orders";
import {
  DEFAULT_COLLECTION_GRADIENT,
  getActiveHeroBanners,
  getActiveJournalEntries,
  formatStorePrice,
  getActiveCollections,
  getActiveMarkets,
  getActiveProducts,
  getActiveSiteNavigation,
  getActiveTestimonials,
  getCollectionPrimaryImage,
  getProductPrimaryImage,
  getRenderableSettings,
  isSystemCollection,
} from "../lib/storefrontHelpers";
import { uploadStorefrontImage } from "../lib/storageUpload";
import logoBlack from "../assets/logoBlack.png";
import "./Auth.css";

type AdminSection =
  | "dashboard"
  | "website"
  | "categories"
  | "products"
  | "messages"
  | "orders"
  | "users"
  | "commonSettings"
  | "activityLog"
  | "crmOverview"
  | "crmCustomers"
  | "crmService"
  | "financeOverview"
  | "financePayments"
  | "financeReconciliation"
  | "financeReports"
  | "factoryOverview"
  | "factoryProduction"
  | "factoryInventory"
  | "factoryDispatch";
type ModalMode = "create" | "edit";

interface SettingsModalState {
  draft: ShopSettings;
}

interface CollectionModalState {
  mode: ModalMode;
  draft: Collection;
}

interface ProductModalState {
  mode: ModalMode;
  draft: Product;
}

interface HeroBannerModalState {
  mode: ModalMode;
  draft: HeroBanner;
}

interface NavigationModalState {
  mode: ModalMode;
  draft: SiteNavigationItem;
}

interface JournalSettingsModalState {
  journalHeadingMn: string;
  journalHeadingEn: string;
  journalSubtextMn: string;
  journalSubtextEn: string;
}

interface JournalEntryModalState {
  mode: ModalMode;
  draft: JournalEntry;
}

interface MarketModalState {
  mode: ModalMode;
  draft: MarketItem;
}

interface TestimonialModalState {
  mode: ModalMode;
  draft: Testimonial;
}

interface ConfirmModalState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

interface OrderModalState {
  draft: OrderRecord;
}

interface UserProfileModalState {
  draft: UserProfile;
}

interface AdminModuleHighlight {
  label: string;
  value: string;
  note: string;
}

interface AdminMenuItem {
  id: AdminSection;
  label: string;
  description: string;
  icon: ReactNode;
  implemented?: boolean;
  requiresPrivilege?: boolean;
  badge?: number;
}

interface AdminMenuGroup {
  key: "common" | "website" | "crm" | "finance" | "factory";
  label: string;
  description: string;
  icon: ReactNode;
  highlights: AdminModuleHighlight[];
  architectureNotes: string[];
  items: AdminMenuItem[];
  badge?: number;
}

function cloneVariants(variants?: Product["variants"]): Product["variants"] {
  return variants?.map((v) => ({ ...v }));
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    images: [...product.images],
    variants: product.variants?.map((variant) => ({ ...variant })),
  };
}

function cloneOrderRecord(order: OrderRecord): OrderRecord {
  return {
    ...order,
    auth: { ...order.auth },
    customer: { ...order.customer },
    address: { ...order.address },
    items: order.items.map((item) => ({ ...item })),
    totals: { ...order.totals },
    payment: { ...order.payment },
  };
}

function getUserIdentity(profile: UserProfile) {
  return profile.displayName || profile.phoneNumber || profile.email || profile.uid;
}

function getRoleLabel(role: UserRole, language: "MN" | "EN") {
  switch (role) {
    case "sysadmin":
      return language === "MN" ? "Систем админ" : "System admin";
    case "admin":
      return language === "MN" ? "Админ" : "Admin";
    case "worker":
      return language === "MN" ? "Ажилтан" : "Employee";
    default:
      return language === "MN" ? "Хэрэглэгч" : "Customer";
  }
}

function getManageableRoleOptions(currentRole: UserRole): UserRole[] {
  const roles: UserRole[] = ["sysadmin", "admin", "worker"];
  return currentRole === "customer" ? [...roles, "customer" as const] : roles;
}

function getUserProviderSummary(profile: UserProfile) {
  return profile.providers.length > 0 ? profile.providers.join(", ") : "-";
}

function getAuthMethodLabel(method: UserAuthMethod, language: "MN" | "EN") {
  switch (method) {
    case "email":
      return language === "MN" ? "И-мэйл" : "Email";
    case "google":
      return "Google";
    case "facebook":
      return "Facebook";
    case "phone":
      return language === "MN" ? "Утас" : "Phone";
    case "guest":
      return language === "MN" ? "Зочин" : "Guest";
    default:
      return language === "MN" ? "Тодорхойгүй" : "Unknown";
  }
}

function getOrderStatusLabel(status: OrderStatus, language: "MN" | "EN") {
  switch (status) {
    case "paid":
      return language === "MN" ? "Төлбөр төлөгдсөн" : "Payment paid";
    case "delivering":
      return language === "MN" ? "Хүргэлт хийгдэж байгаа" : "Delivering";
    case "delivered":
      return language === "MN" ? "Хүргэгдсэн" : "Delivered";
    default:
      return language === "MN" ? "Шинэ" : "New";
  }
}

function getOrderStatusClassName(status: OrderStatus) {
  switch (status) {
    case "paid":
      return "admin-order-status-badge paid";
    case "delivering":
      return "admin-order-status-badge delivering";
    case "delivered":
      return "admin-order-status-badge delivered";
    default:
      return "admin-order-status-badge new";
  }
}

function getOrderTotalQuantity(order: OrderRecord) {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

function getOrderPaymentStatusLabel(status: OrderRecord["payment"]["status"], language: "MN" | "EN") {
  switch (status) {
    case "paid":
      return language === "MN" ? "Төлөгдсөн" : "Paid";
    case "failed":
      return language === "MN" ? "Амжилтгүй" : "Failed";
    case "cancelled":
      return language === "MN" ? "Цуцлагдсан" : "Cancelled";
    default:
      return language === "MN" ? "Хүлээгдэж буй" : "Pending";
  }
}

function formatAdminDateTime(value: string | null, language: "MN" | "EN") {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(language === "MN" ? "mn-MN" : "en-US");
}

function getLocalizedManagedText(language: "MN" | "EN", english: string, mongolian: string) {
  const primary = language === "MN" ? mongolian : english;
  const fallback = language === "MN" ? english : mongolian;
  return primary.trim() || fallback.trim();
}

function getManagedNavigationLabel(item: SiteNavigationItem, language: "MN" | "EN") {
  return getLocalizedManagedText(language, item.labelEn, item.labelMn);
}

function getManagedJournalTitle(entry: JournalEntry, language: "MN" | "EN") {
  return getLocalizedManagedText(language, entry.titleEn, entry.titleMn);
}

function getManagedJournalCategory(entry: JournalEntry, language: "MN" | "EN") {
  return getLocalizedManagedText(language, entry.categoryEn, entry.categoryMn);
}

function AdminModal({
  title,
  description,
  onClose,
  children,
  wide = false,
  disableClose = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  disableClose?: boolean;
}) {
  const handleClose = () => {
    if (disableClose) {
      return;
    }

    onClose();
  };

  return (
    <div className="admin-modal-backdrop" onClick={handleClose}>
      <div
        className={`admin-modal ${wide ? "admin-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="admin-modal-close"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={disableClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  activeLabel,
  inactiveLabel,
}: {
  status: EntityStatus;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={`admin-status-badge ${status === "active" ? "active" : "inactive"}`}>
      {status === "active" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {status === "active" ? activeLabel : inactiveLabel}
    </span>
  );
}

export default function Account() {
  const navigate = useNavigate();
  const { user, profile, role, authMethod, isPrivilegedUser, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { items: cartItems, totalItems: cartTotalItems, totalPrice: cartTotalPrice, updateQuantity: updateCartQuantity, removeItem: removeCartItem } = useCart();
  const {
    settings,
    collections,
    products,
    heroBanners,
    markets,
    testimonials,
    loading,
    saving,
    error,
    backend,
    structure,
    saveSettingsDraft,
    saveCollectionDraft,
    deleteCollection,
    saveProductDraft,
    deleteProduct,
    updateProduct,
    saveHeroBannerDraft,
    deleteHeroBanner,
    saveMarketDraft,
    deleteMarket,
    saveTestimonialDraft,
    deleteTestimonial,
  } = useStorefront();

  const copy =
    language === "MN"
      ? {
          dashboard: "Dashboard",
          website: "Website",
          categoriesMenu: "Ангилал",
          productsMenu: "Бүтээгдэхүүн",
          messagesMenu: "Мессеж",
          ordersMenu: "Захиалга",
          usersMenu: "Хэрэглэгч",
          dashboardTitle: "Админ хянах самбар",
          dashboardText: "Website, Ангилал, Бүтээгдэхүүн хэсгүүдийг modal-based workflow-оор удирдана.",
          websiteTitle: "Вэб контент",
          websiteText: "Storefront settings, market, testimonial мэдээллүүд энэ хэсгээс modal-аар засагдана.",
          categoriesTitle: "Ангиллын удирдлага",
          categoriesText: "Ангилал нэмэх, засах, идэвхжүүлэх, идэвхгүй болгох бүх үйлдэл modal-оор хийгдэнэ.",
          productsTitle: "Бүтээгдэхүүний удирдлага",
          productsText: "Бүх бүтээгдэхүүний статус, үнэ, ангилал, тайлбар, variant-ийг modal-аар удирдана.",
          messagesTitle: "Ирсэн мессежүүд",
          messagesText: "Contact page-ийн form-оор илгээсэн мессежүүдийг эндээс харна.",
          ordersTitle: "Захиалгын удирдлага",
          ordersText: "Захиалгын төлөв, төлбөр, хүргэлтийн явц болон хүлээн авагчийн мэдээллийг эндээс удирдана.",
          newOrders: "Шинэ",
          deliveringOrders: "Хүргэлтэнд гарсан",
          deliveredOrders: "Хүргэгдсэн",
          paymentLabel: "Төлбөр",
          createdLabel: "Үүссэн огноо",
          editOrder: "Захиалга засах",
          orderDetailsTitle: "Захиалгын мэдээлэл засах",
          orderDetailsText: "Төлөв, хүлээн авагчийн мэдээлэл, хүргэлтийн хаягийг админаас шинэчилнэ.",
          orderInfo: "Захиалгын ерөнхий мэдээлэл",
          orderItemsLabel: "Захиалсан бараа",
          orderPaymentLabel: "Төлбөрийн төлөв",
          paymentStateLabel: "Төлбөрийн төлөв",
          paidAtLabel: "Төлбөр төлөгдсөн огноо",
          orderStatusHelp: "Төлөв өөрчлөхөд payment state автоматаар уялдан шинэчлэгдэнэ.",
          orderReadonlyItemsNote: "Барааны мөрүүдийг энэ хувилбарт зөвхөн харах боломжтой.",
          orderUpdateFailed: "Захиалгын мэдээллийг хадгалж чадсангүй.",
          products: "Бүтээгдэхүүн",
          collections: "Ангилал",
          orders: "Захиалга",
          banners: "Баннер",
          navigation: "Header navigation",
          markets: "Markets",
          journal: "Сэтгүүл",
          testimonials: "Testimonials",
          settings: "Website Settings",
          totalProducts: "Бүтээгдэхүүн",
          totalCollections: "Ангилал",
          totalMessages: "Мессеж",
          totalOrders: "Захиалга",
          totalBanners: "Баннер",
          totalMarkets: "Markets",
          totalTestimonials: "Testimonials",
          activeCount: "Active",
          inactiveCount: "Inactive",
          actions: "Action",
          linkedProducts: "Хамааралтай бүтээгдэхүүн",
          pendingOrders: "Хүлээгдэж буй",
          paidOrders: "Төлбөр төлөгдсөн",
          guestOrders: "Зочин захиалга",
          bestSellerCount: "Best seller",
          compareShort: "Compare",
          image: "Зураг",
          emptyCategories: "Ангилал байхгүй байна.",
          emptyProducts: "Бүтээгдэхүүн байхгүй байна.",
          emptyMessages: "Одоогоор мессеж ирээгүй байна.",
          emptyOrders: "Захиалга байхгүй байна.",
          openWebsite: "Website",
          openCategories: "Ангилал",
          openProducts: "Бүтээгдэхүүн",
          openOrders: "Захиалга",
          openUsers: "Хэрэглэгч",
          signedIn: "Нэвтэрсэн хэрэглэгч",
          status: "Төлөв",
          active: "Active",
          inactive: "Inactive",
          live: "Active session",
          logout: "Гарах",
          add: "Нэмэх",
          edit: "Засах",
          delete: "Устгах",
          cancel: "Болих",
          save: "Хадгалах",
          close: "Хаах",
          createCollection: "Ангилал нэмэх",
          createProduct: "Бүтээгдэхүүн нэмэх",
          createBanner: "Баннер нэмэх",
          editNavigation: "Header navigation засах",
          editJournalSection: "Journal хэсэг засах",
          createJournal: "Journal нийтлэл нэмэх",
          editJournal: "Journal нийтлэл засах",
          createJournalEntry: "Нийтлэл нэмэх",
          createMarket: "Market нэмэх",
          createTestimonial: "Testimonial нэмэх",
          editWebsite: "Website тохиргоо засах",
          reset: "Анхны төлөвт оруулах",
          resetConfirmTitle: "Storefront reset",
          resetConfirmDescription: "Бүх storefront мэдээллийг default утга руу буцаах уу?",
          basicInfo: "Ерөнхий мэдээлэл",
          productEditor: "Product details",
          dangerReset: "Shop-ийн бүх засварыг default утга руу буцаах уу?",
          bestSeller: "Best seller",
          comparePrice: "Compare at price",
          badge: "Badge",
          variants: "Variants",
          variantName: "Хэмжээ",
          variantPrice: "Үнэ",
          variantQuantity: "Тоо ширхэг",
          addVariant: "Variant нэмэх",
          totalStock: "Нийт нөөц",
          soldCount: "Зарагдсан",
          stockRemaining: "Үлдэгдэл",
          imageHelp: "Category card болон home section дээр харагдах зургийн URL оруулна.",
          imagePreview: "Зургийн preview",
          variantsHelp: "Нэг мөрөнд `Нэр|Үнэ` форматаар оруулна.",
          productImages: "Бүтээгдэхүүний зураг",
          productImagesHelp: "Ихдээ 3 зураг upload хийж болно.",
          addImage: "Зураг нэмэх",
          ingredientsLabel: "Орц найрлага",
          usageLabel: "Үйлчилгээ",
          howToUseLabel: "Хэрэглэх заавар",
          cautionLabel: "Анхаар зүйлс",
          shelfLifeLabel: "Хадгалах хугацаа",
          sizeLabelField: "Хэмжээ / Грамм",
          sizeLabelHelp: "Variants байхгүй үед харагдана. Жишээ: 85 гр, 100 мл",
          description: "Тайлбар",
          price: "Үнэ",
          name: "Нэр",
          category: "Ангилал",
          brandName: "Brand нэр",
          brandDescription: "Brand description",
          labelMn: "Монгол гарчиг",
          labelEn: "English label",
          pageBanner: "Page banner",
          pageBannerHelp: "Тухайн menu route-ийн hero background дээр харагдах зургийн URL.",
          group: "Байршил",
          customerInfo: "Хүлээн авагчийн мэдээлэл",
          addressInfo: "Хүргэлтийн хаяг",
          note: "Тэмдэглэл",
          receivedAt: "Ирсэн хугацаа",
          senderName: "Илгээгч",
          senderEmail: "И-мэйл",
          messageSubject: "Сэдэв",
          messageBody: "Мессеж",
          heroHeading: "Hero heading",
          heroSubtext: "Hero subtext",
          aboutTitle: "About title",
          aboutBody: "About body",
          contactPhone: "Утасны дугаар",
          contactEmail: "Contact email",
          location: "Байршил",
          responseTime: "Response time",
          facebookUrl: "Facebook URL",
          instagramHandle: "Instagram handle",
          instagramUrl: "Instagram URL",
          mapNote: "Map note",
          marketIntro: "Market intro",
          storeHoursText: "Store hours text",
          wholesaleHeading: "Wholesale heading",
          wholesaleText: "Wholesale text",
          wholesaleEmail: "Wholesale email",
          leftGroup: "Зүүн тал",
          rightGroup: "Баруун тал",
          sortOrder: "Дараалал",
          journalHeadingMn: "Journal гарчиг (MN)",
          journalHeadingEn: "Journal heading (EN)",
          journalSubtextMn: "Journal тайлбар (MN)",
          journalSubtextEn: "Journal subtext (EN)",
          journalEntries: "Journal нийтлэлүүд",
          publishedAt: "Нийтэлсэн огноо",
          categoryMn: "Ангилал (MN)",
          categoryEn: "Category (EN)",
          titleMn: "Гарчиг (MN)",
          titleEn: "Title (EN)",
          excerptMn: "Товч агуулга (MN)",
          excerptEn: "Excerpt (EN)",
          journalImage: "Journal зураг",
          journalImageHelp: "Blog card дээр харагдах cover image URL. URL оруулах эсвэл шууд файл upload хийж болно.",
          schedule: "Хуваарь",
          address: "Хаяг",
          season: "Улирал",
          quote: "Сэтгэгдэл",
          author: "Зохиогч",
          displayName: "Дэлгэцийн нэр",
          userRole: "Хэрэглэгчийн эрх",
          userUid: "UID",
          userProviders: "Provider-ууд",
          registeredVia: "Бүртгэсэн төрөл",
          lastAuth: "Сүүлийн нэвтрэлт",
          registeredAt: "Бүртгүүлсэн огноо",
          phoneLoginEmail: "Phone login email",
          editUser: "Хэрэглэгч засах",
          userModalTitle: "Хэрэглэгчийн мэдээлэл",
          userModalDescription: "Sysadmin болон admin эрхтэй хэрэглэгч бусад хэрэглэгчийн мэдээлэл, эрхийг эндээс шинэчилнэ.",
          userUpdateFailed: "Хэрэглэгчийн мэдээллийг хадгалж чадсангүй.",
          currentUserReadOnly: "Өөрийн профайлыг энэ хэсгээс засахгүй.",
          bannerCollection: "Ангилал",
          bannerImage: "Баннер зураг",
          bannerUpload: "Зураг upload",
          bannerUploadProgress: "Зураг upload хийж байна...",
          bannerUploadFailed: "Зураг upload амжилтгүй боллоо.",
          bannerSummary: "Home hero slideshow дээрх баннерууд.",
          messagesLast7Days: "Сүүлийн 7 хоног",
          latestReceived: "Сүүлд ирсэн",
          messagesListHelp: "Contact form-оос ирсэн мессежүүд newest эхэндээ харагдана.",
          bannerModalCreate: "Баннер нэмэх",
          bannerModalEdit: "Баннер засах",
          deleteBannerDescription: "Энэ баннерыг устгах уу?",
          bannerDependencyError: "Энэ ангилал баннер дээр ашиглагдаж байгаа тул устгах боломжгүй.",
          bannerImageHelp: "URL оруулах эсвэл шууд файл upload хийж болно.",
          bannerAspectTitle: "Зөвлөмжит зургийн стандарт",
          bannerAspectValue: "16:9 харьцаа",
          bannerAspectHelp: "Хамгийн багадаа 1600 x 900, боломжтой бол 1920 x 1080 зураг ашиглаарай.",
          bannerImportedSource: "Эх сурвалж: SAVANA",
          bannerUploadedSource: "Эх сурвалж: Admin upload",
          quickOverview: "Хурдан тойм",
          livePreview: "Storefront live data",
          language: "Хэл",
          english: "English",
          mongolian: "Монгол",
          firebaseSync: "Firebase sync",
          firestoreStructure: "Firestore бүтэц",
          syncLoading: "Уншиж байна",
          syncSaving: "Хадгалж байна",
          syncLive: "Live",
          syncError: "Алдаа",
          settingsModalTitle: "Website settings",
          settingsModalText: "Brand болон website дээр харагдах үндсэн текстүүдийг нэг modal-аас шинэчилнэ.",
          collectionModalCreate: "Ангилал нэмэх",
          collectionModalEdit: "Ангилал засах",
          productModalCreate: "Бүтээгдэхүүн нэмэх",
          productModalEdit: "Бүтээгдэхүүн засах",
          marketModalCreate: "Market нэмэх",
          marketModalEdit: "Market засах",
          testimonialModalCreate: "Testimonial нэмэх",
          testimonialModalEdit: "Testimonial засах",
          confirmDeleteTitle: "Устгах баталгаажуулалт",
          deleteProductDescription: "Энэ бүтээгдэхүүнийг устгах уу?",
          deleteNavigationDescription: "Энэ navigation item-ийг header-ээс нуух уу?",
          navigationModalCreate: "Navigation item идэвхжүүлэх",
          navigationModalEdit: "Navigation item засах",
          journalSettingsModalTitle: "Journal хэсгийн тохиргоо",
          journalModalCreate: "Journal нийтлэл нэмэх",
          journalModalEdit: "Journal нийтлэл засах",
          deleteJournalEntryDescription: "Энэ journal нийтлэлийг устгах уу?",
          deleteMarketDescription: "Энэ market мэдээллийг устгах уу?",
          deleteTestimonialDescription: "Энэ testimonial-ийг устгах уу?",
          deleteCollectionDescription: "Энэ ангиллыг устгах уу?",
          categoryDeleteLocked: "Энэ ангиллыг устгах боломжгүй.",
          categoryLastLocked: "Сүүлийн үлдсэн ангиллыг устгах боломжгүй. Эхлээд өөр ангилал үүсгэнэ үү.",
          categoryDependencyError: "Энэ ангилал дээр хамааралтай бүтээгдэхүүнүүд байгаа тул устгах боломжгүй.",
          noCategories: "Идэвхтэй ангилал байхгүй байна. Эхлээд ангилал идэвхжүүлнэ үү.",
          categorySystemNote: "Системийн ангилал",
          currentStatus: "Одоогийн төлөв",
          activeOnWebsite: "Active үед вэб дээр харагдана.",
          settingsInactiveNote: "Website settings inactive үед public site default контентийг ашиглана.",
          systemProtected: "System protected",
          navigationSummary: "Header menu дээр харагдах page-үүдийн дараалал, хэл, статус.",
          messagesSummary: "Contact page-ээс илгээсэн хэрэглэгчийн хүсэлтүүд.",
          journalSummary: "Сэтгүүл page дээрх гарчиг, тайлбар, нийтлэлүүд.",
          marketSummary: "Find Us page дээрх мэдээлэл.",
          testimonialSummary: "Home page дээрх customer review.",
          categorySummary: "Header, filter, storefront cards дээр ашиглагдана.",
          productSummary: "Collections page, home page, detail page дээр ашиглагдана.",
          statusSummary: "Status active үед selection болон public web дээр харагдана.",
        }
      : {
          dashboard: "Dashboard",
          website: "Website",
          categoriesMenu: "Categories",
          productsMenu: "Products",
          messagesMenu: "Messages",
          ordersMenu: "Orders",
          usersMenu: "Users",
          dashboardTitle: "Admin dashboard",
          dashboardText: "Manage Website, Categories, and Products through modal-based workflows.",
          websiteTitle: "Website content",
          websiteText: "Storefront settings, markets, and testimonials are managed from this section.",
          categoriesTitle: "Category management",
          categoriesText: "Create, edit, activate, or deactivate categories through modal forms.",
          productsTitle: "Product management",
          productsText: "Manage product status, pricing, category, descriptions, and variants in modal forms.",
          messagesTitle: "Incoming messages",
          messagesText: "Review messages submitted from the contact page form.",
          ordersTitle: "Order management",
          ordersText: "Manage order status, payment state, delivery progress, and recipient details from one place.",
          newOrders: "New",
          deliveringOrders: "Delivering",
          deliveredOrders: "Delivered",
          paymentLabel: "Payment",
          createdLabel: "Created",
          editOrder: "Edit order",
          orderDetailsTitle: "Edit order details",
          orderDetailsText: "Update the order status, recipient details, and delivery address from admin.",
          orderInfo: "Order information",
          orderItemsLabel: "Ordered items",
          orderPaymentLabel: "Payment details",
          paymentStateLabel: "Payment state",
          paidAtLabel: "Paid at",
          orderStatusHelp: "Changing the status automatically syncs the payment state.",
          orderReadonlyItemsNote: "Line items are read-only in this version.",
          orderUpdateFailed: "Unable to save the order details.",
          products: "Products",
          collections: "Categories",
          orders: "Orders",
          banners: "Banners",
          navigation: "Header navigation",
          markets: "Markets",
          journal: "Journal",
          testimonials: "Testimonials",
          settings: "Website Settings",
          totalProducts: "Products",
          totalCollections: "Categories",
          totalMessages: "Messages",
          totalOrders: "Orders",
          totalBanners: "Banners",
          totalMarkets: "Markets",
          totalTestimonials: "Testimonials",
          activeCount: "Active",
          inactiveCount: "Inactive",
          actions: "Action",
          linkedProducts: "Linked products",
          pendingOrders: "Pending",
          paidOrders: "Paid",
          guestOrders: "Guest orders",
          bestSellerCount: "Best sellers",
          compareShort: "Compare",
          image: "Image",
          emptyCategories: "No categories found.",
          emptyProducts: "No products found.",
          emptyMessages: "No messages have been submitted yet.",
          emptyOrders: "No orders found.",
          openWebsite: "Website",
          openCategories: "Categories",
          openProducts: "Products",
          openOrders: "Orders",
          openUsers: "Users",
          signedIn: "Signed in user",
          status: "Status",
          active: "Active",
          inactive: "Inactive",
          live: "Active session",
          logout: "Logout",
          add: "Add",
          edit: "Edit",
          delete: "Delete",
          cancel: "Cancel",
          save: "Save",
          close: "Close",
          createCollection: "Create category",
          createProduct: "Create product",
          createBanner: "Create banner",
          editNavigation: "Edit header navigation",
          editJournalSection: "Edit journal section",
          createJournal: "Create journal entry",
          editJournal: "Edit journal entry",
          createJournalEntry: "Create journal entry",
          createMarket: "Create market",
          createTestimonial: "Create testimonial",
          editWebsite: "Edit website settings",
          reset: "Reset storefront",
          resetConfirmTitle: "Storefront reset",
          resetConfirmDescription: "Reset all storefront content back to defaults?",
          basicInfo: "Basic Info",
          productEditor: "Product details",
          dangerReset: "Reset all storefront edits back to defaults?",
          bestSeller: "Best seller",
          comparePrice: "Compare at price",
          badge: "Badge",
          variants: "Variants",
          variantName: "Size",
          variantPrice: "Price",
          variantQuantity: "Quantity",
          addVariant: "Add variant",
          totalStock: "Total stock",
          soldCount: "Sold",
          stockRemaining: "Remaining",
          imageHelp: "Paste the image URL used on category cards and home sections.",
          imagePreview: "Image preview",
          variantsHelp: "Enter one variant per line using `Name|Price`.",
          productImages: "Product images",
          productImagesHelp: "Upload up to 3 images.",
          addImage: "Add image",
          ingredientsLabel: "Ingredients",
          usageLabel: "Usage",
          howToUseLabel: "How to use",
          cautionLabel: "Caution",
          shelfLifeLabel: "Shelf life",
          sizeLabelField: "Size / Weight",
          sizeLabelHelp: "Shown when no variants exist. e.g. 85g, 100ml",
          description: "Description",
          price: "Price",
          name: "Name",
          category: "Category",
          brandName: "Brand name",
          brandDescription: "Brand description",
          labelMn: "Mongolian label",
          labelEn: "English label",
          pageBanner: "Page banner",
          pageBannerHelp: "Image URL used as the hero background for that menu page.",
          group: "Placement",
          customerInfo: "Recipient details",
          addressInfo: "Delivery address",
          note: "Note",
          receivedAt: "Received",
          senderName: "Sender",
          senderEmail: "Email",
          messageSubject: "Subject",
          messageBody: "Message",
          heroHeading: "Hero heading",
          heroSubtext: "Hero subtext",
          aboutTitle: "About title",
          aboutBody: "About body",
          contactPhone: "Phone number",
          contactEmail: "Contact email",
          location: "Location",
          responseTime: "Response time",
          facebookUrl: "Facebook URL",
          instagramHandle: "Instagram handle",
          instagramUrl: "Instagram URL",
          mapNote: "Map note",
          marketIntro: "Market intro",
          storeHoursText: "Store hours text",
          wholesaleHeading: "Wholesale heading",
          wholesaleText: "Wholesale text",
          wholesaleEmail: "Wholesale email",
          leftGroup: "Left side",
          rightGroup: "Right side",
          sortOrder: "Sort order",
          journalHeadingMn: "Journal heading (MN)",
          journalHeadingEn: "Journal heading (EN)",
          journalSubtextMn: "Journal subtext (MN)",
          journalSubtextEn: "Journal subtext (EN)",
          journalEntries: "Journal entries",
          publishedAt: "Published date",
          categoryMn: "Category (MN)",
          categoryEn: "Category (EN)",
          titleMn: "Title (MN)",
          titleEn: "Title (EN)",
          excerptMn: "Excerpt (MN)",
          excerptEn: "Excerpt (EN)",
          journalImage: "Journal image",
          journalImageHelp: "Optional cover image URL shown on the journal card. Paste a URL or upload a file directly.",
          schedule: "Schedule",
          address: "Address",
          season: "Season",
          quote: "Quote",
          author: "Author",
          displayName: "Display name",
          userRole: "User role",
          userUid: "UID",
          userProviders: "Providers",
          registeredVia: "Registered via",
          lastAuth: "Last auth",
          registeredAt: "Registered at",
          phoneLoginEmail: "Phone login email",
          editUser: "Edit user",
          userModalTitle: "User profile",
          userModalDescription: "Privileged users can review and update another user's profile and access level here.",
          userUpdateFailed: "Unable to save the user profile.",
          currentUserReadOnly: "Your own profile is not edited from this directory.",
          bannerCollection: "Categories",
          bannerImage: "Banner image",
          bannerUpload: "Upload image",
          bannerUploadProgress: "Uploading image...",
          bannerUploadFailed: "Image upload failed.",
          bannerSummary: "Displayed inside the homepage hero slideshow.",
          messagesLast7Days: "Last 7 days",
          latestReceived: "Latest",
          messagesListHelp: "Messages submitted from the contact form appear here with the newest first.",
          bannerModalCreate: "Create banner",
          bannerModalEdit: "Edit banner",
          deleteBannerDescription: "Delete this banner?",
          bannerDependencyError: "This category is used by hero banners and cannot be deleted.",
          bannerImageHelp: "Paste an image URL or upload a file directly.",
          bannerAspectTitle: "Recommended image format",
          bannerAspectValue: "16:9 aspect ratio",
          bannerAspectHelp: "Use at least 1600 x 900, ideally 1920 x 1080 for the homepage hero.",
          bannerImportedSource: "Source: SAVANA",
          bannerUploadedSource: "Source: Admin upload",
          quickOverview: "Quick overview",
          livePreview: "Storefront live data",
          language: "Language",
          english: "English",
          mongolian: "Mongolian",
          firebaseSync: "Firebase sync",
          firestoreStructure: "Firestore structure",
          syncLoading: "Loading",
          syncSaving: "Saving",
          syncLive: "Live",
          syncError: "Error",
          settingsModalTitle: "Website settings",
          settingsModalText: "Update brand and website-facing copy from one modal.",
          collectionModalCreate: "Create category",
          collectionModalEdit: "Edit category",
          productModalCreate: "Create product",
          productModalEdit: "Edit product",
          marketModalCreate: "Create market",
          marketModalEdit: "Edit market",
          testimonialModalCreate: "Create testimonial",
          testimonialModalEdit: "Edit testimonial",
          confirmDeleteTitle: "Delete confirmation",
          deleteProductDescription: "Delete this product?",
          deleteNavigationDescription: "Hide this navigation item from the header?",
          navigationModalCreate: "Activate navigation item",
          navigationModalEdit: "Edit navigation item",
          journalSettingsModalTitle: "Journal section settings",
          journalModalCreate: "Create journal entry",
          journalModalEdit: "Edit journal entry",
          deleteJournalEntryDescription: "Delete this journal entry?",
          deleteMarketDescription: "Delete this market entry?",
          deleteTestimonialDescription: "Delete this testimonial?",
          deleteCollectionDescription: "Delete this category?",
          categoryDeleteLocked: "This category cannot be deleted.",
          categoryLastLocked: "This is the last remaining category. Create another one before deleting it.",
          categoryDependencyError: "This category is referenced by products and cannot be deleted.",
          noCategories: "No active categories available. Activate or create a category first.",
          categorySystemNote: "System category",
          currentStatus: "Current status",
          activeOnWebsite: "Visible on selections and website when active.",
          settingsInactiveNote: "When website settings are inactive, the public site falls back to default copy.",
          systemProtected: "System protected",
          navigationSummary: "Controls the page labels, placement, and visibility in the header menu.",
          messagesSummary: "Customer inquiries submitted from the contact page.",
          journalSummary: "Controls the journal page heading, subtext, and editorial entries.",
          marketSummary: "Displayed on the Find Us page.",
          testimonialSummary: "Displayed on the homepage.",
          categorySummary: "Used in header navigation, filters, and storefront cards.",
          productSummary: "Used across collections, homepage, and product detail pages.",
          statusSummary: "Only active items appear in selections and on the public website.",
        };

  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [loggingOut, setLoggingOut] = useState(false);
  const [settingsModal, setSettingsModal] = useState<SettingsModalState | null>(null);
  const [collectionModal, setCollectionModal] = useState<CollectionModalState | null>(null);
  const [productModal, setProductModal] = useState<ProductModalState | null>(null);
  const [navigationModal, setNavigationModal] = useState<NavigationModalState | null>(null);
  const [journalSettingsModal, setJournalSettingsModal] = useState<JournalSettingsModalState | null>(null);
  const [journalEntryModal, setJournalEntryModal] = useState<JournalEntryModalState | null>(null);
  const [userProfileModal, setUserProfileModal] = useState<UserProfileModalState | null>(null);
  const [heroBannerModal, setHeroBannerModal] = useState<HeroBannerModalState | null>(null);
  const [marketModal, setMarketModal] = useState<MarketModalState | null>(null);
  const [testimonialModal, setTestimonialModal] = useState<TestimonialModalState | null>(null);
  const [orderModal, setOrderModal] = useState<OrderModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [navigationBannerUploadError, setNavigationBannerUploadError] = useState<string | null>(null);
  const [navigationBannerUploading, setNavigationBannerUploading] = useState(false);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [journalImageUploadError, setJournalImageUploadError] = useState<string | null>(null);
  const [journalImageUploading, setJournalImageUploading] = useState(false);
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [productImageUploadError, setProductImageUploadError] = useState<string | null>(null);
  const [savingUserProfile, setSavingUserProfile] = useState(false);
  const [userProfileError, setUserProfileError] = useState<string | null>(null);
  const [savingOrderModal, setSavingOrderModal] = useState(false);
  const [orderModalError, setOrderModalError] = useState<string | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<ContactMessageRecord[]>([]);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [myOrdersError, setMyOrdersError] = useState<string | null>(null);
  const [openNavGroups, setOpenNavGroups] = useState<Record<AdminMenuGroup["key"], boolean>>({
    common: true,
    website: true,
    crm: false,
    finance: false,
    factory: false,
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const visibleSettings = useMemo(() => getRenderableSettings(settings), [settings]);
  const activeNavigationItems = useMemo(
    () => getActiveSiteNavigation(settings.navigationItems),
    [settings.navigationItems]
  );
  const activeJournalEntries = useMemo(
    () => getActiveJournalEntries(settings.journalEntries),
    [settings.journalEntries]
  );
  const activeCollections = useMemo(() => getActiveCollections(collections), [collections]);
  const activeProducts = useMemo(() => getActiveProducts(products, collections), [products, collections]);
  const activeHeroBanners = useMemo(() => getActiveHeroBanners(heroBanners, collections), [heroBanners, collections]);
  const activeMarkets = useMemo(() => getActiveMarkets(markets), [markets]);
  const activeTestimonials = useMemo(() => getActiveTestimonials(testimonials), [testimonials]);
  const navigationPreviewItems = useMemo(
    () =>
      [...settings.navigationItems].sort((left, right) => {
        if (left.group !== right.group) {
          return left.group === "left" ? -1 : 1;
        }

        return left.sortOrder - right.sortOrder;
      }),
    [settings.navigationItems]
  );
  const journalPreviewEntries = useMemo(
    () =>
      [...settings.journalEntries].sort((left, right) => {
        const leftTime = Date.parse(left.publishedAt);
        const rightTime = Date.parse(right.publishedAt);

        if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
          return right.id - left.id;
        }

        return rightTime - leftTime;
      }),
    [settings.journalEntries]
  );
  const inactiveNavigationItems = useMemo(
    () => settings.navigationItems.filter((item) => item.status === "inactive"),
    [settings.navigationItems]
  );
  const selectableCategories = useMemo(
    () => activeCollections.filter((collection) => !isSystemCollection(collection)),
    [activeCollections]
  );
  const bannerCategories = useMemo(
    () => collections.filter((collection) => !isSystemCollection(collection)),
    [collections]
  );
  const collectionNameBySlug = useMemo(
    () => new Map(collections.map((collection) => [collection.slug, collection.name])),
    [collections]
  );
  const regularCollectionCount = useMemo(
    () => collections.filter((collection) => !isSystemCollection(collection)).length,
    [collections]
  );
  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();

    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }

    return counts;
  }, [products]);
  const inactiveCollectionsCount = collections.length - activeCollections.length;
  const inactiveProductsCount = products.length - activeProducts.length;
  const linkedCollectionCount = useMemo(
    () => collections.filter((collection) => (productCountByCategory.get(collection.slug) ?? 0) > 0).length,
    [collections, productCountByCategory]
  );
  const bestSellerCount = useMemo(() => products.filter((product) => product.bestSeller).length, [products]);
  const currentRegistrationMethod = profile?.registrationMethod ?? authMethod;
  const userRoleCounts = useMemo(
    () =>
      directoryUsers.reduce(
        (counts, directoryUser) => {
          const resolvedRole = resolveUserRole(directoryUser);
          counts[resolvedRole] += 1;
          return counts;
        },
        { sysadmin: 0, admin: 0, worker: 0, customer: 0 } as Record<UserRole, number>,
      ),
    [directoryUsers]
  );
  const _newOrdersCount = useMemo(() => orders.filter((order) => order.status === "new").length, [orders]);
  const paidOrdersCount = useMemo(() => orders.filter((order) => order.status === "paid").length, [orders]);
  const deliveringOrdersCount = useMemo(
    () => orders.filter((order) => order.status === "delivering").length,
    [orders]
  );
  const deliveredOrdersCount = useMemo(
    () => orders.filter((order) => order.status === "delivered").length,
    [orders]
  );
  const guestOrdersCount = useMemo(
    () => orders.filter((order) => order.auth.isAnonymous).length,
    [orders]
  );
  const contactMessagesLast7DaysCount = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return contactMessages.filter((contactMessage) => {
      if (!contactMessage.createdAt) {
        return false;
      }

      const createdAt = Date.parse(contactMessage.createdAt);
      return !Number.isNaN(createdAt) && createdAt >= cutoff;
    }).length;
  }, [contactMessages]);
  const latestContactMessageAt = contactMessages[0]?.createdAt ?? null;
  const orderStatusOptions = useMemo(
    () => [
      { value: "new" as const, label: getOrderStatusLabel("new", language) },
      { value: "paid" as const, label: getOrderStatusLabel("paid", language) },
      { value: "delivering" as const, label: getOrderStatusLabel("delivering", language) },
      { value: "delivered" as const, label: getOrderStatusLabel("delivered", language) },
    ],
    [language]
  );
  const implementedSections = new Set<AdminSection>([
    "dashboard",
    "website",
    "categories",
    "products",
    "messages",
    "orders",
    "users",
  ]);
  const adminMenuGroups: AdminMenuGroup[] =
    language === "MN"
      ? [
          {
            key: "common",
            label: "Нийтлэг",
            description: "Нэгдсэн нэвтрэлт, эрх, системийн тохиргоо, audit layer.",
            icon: <LayoutDashboard size={20} />,
            highlights: [
              {
                label: "Access model",
                value: "RBAC",
                note: "Нэг хэрэглэгчийн сангаас Website, CRM, Finance, Factory эрхийг удирдана.",
              },
              {
                label: "Ops layer",
                value: "Shared",
                note: "Системийн тохиргоо, интеграц, activity log нийтлэг түвшинд байрлана.",
              },
              {
                label: "Current role",
                value: getRoleLabel(role, language),
                note: "Нэвтэрсэн хэрэглэгчийн одоогийн системийн түвшин.",
              },
            ],
            architectureNotes: [
              "Identity, roles, permissions, environment settings нийтлэг цөмд байрлана.",
              "Cross-module report, audit trail, notifications нь module бүрээс тусдаа удирдагдана.",
              "Future tenant, branch, warehouse тохиргоонууд энэ түвшинд төвлөрнө.",
            ],
            items: [
              {
                id: "dashboard",
                label: copy.dashboard,
                description: "Бүх модуль дээрх ерөнхий төлөв, KPI, live sync.",
                icon: <LayoutDashboard size={18} />,
                implemented: true,
              },
              {
                id: "users",
                label: "Хэрэглэгч ба эрх",
                description: "Хэрэглэгч, role, access policy удирдлага.",
                icon: <Users size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "commonSettings",
                label: "Системийн тохиргоо",
                description: "Environment, tenant, integrations, global policy.",
                icon: <Pencil size={18} />,
              },
              {
                id: "activityLog",
                label: "Тайлан ба лог",
                description: "Audit trail, activity feed, cross-module reports.",
                icon: <CheckCircle2 size={18} />,
              },
              {
                id: "products",
                label: "Бүтээгдэхүүн",
                description: "SKU, pricing, copy, assets, status management.",
                icon: <Package size={18} />,
                implemented: true,
              },
              {
                id: "categories",
                label: "Ангилал",
                description: "Catalog taxonomy, collection structure.",
                icon: <Store size={18} />,
                implemented: true,
              },
            ],
          },
          {
            key: "website",
            label: "Website",
            description: "Паблик storefront, контент, каталог, merchandising.",
            icon: <Globe size={20} />,
            highlights: [
              {
                label: copy.totalCollections,
                value: `${activeCollections.length}/${collections.length}`,
                note: "Навигаци, collection landing, storefront taxonomy.",
              },
              {
                label: copy.totalProducts,
                value: `${activeProducts.length}/${products.length}`,
                note: "Каталог, үнэ, media, merchandising dataset.",
              },
              {
                label: copy.totalBanners,
                value: `${activeHeroBanners.length}/${heroBanners.length}`,
                note: "Hero, campaign, editorial surface-ууд.",
              },
            ],
            architectureNotes: [
              "Website модуль нь public content, каталог, merchandising flow-г дангаар нь удирдана.",
              "Categories, Products, Content hub нь нэг catalog domain-д хамаарна.",
              "Public storefront болон admin content lifecycle салангид боловч нэг өгөгдлийн эх үүсвэртэй байна.",
            ],
            items: [
              {
                id: "website",
                label: "Контент төв",
                description: "Website settings, banners, markets, testimonials.",
                icon: <Globe size={18} />,
                implemented: true,
              },
              {
                id: "messages",
                label: copy.messagesMenu,
                description: "Contact form-оор ирсэн хэрэглэгчийн мессежүүд.",
                icon: <MessageSquareQuote size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
            ],
          },
          {
            key: "crm",
            label: "CRM",
            badge: paidOrdersCount > 0 ? paidOrdersCount : undefined,
            description: "Customer 360, захиалга, service, retention workflow.",
            icon: <Users size={20} />,
            highlights: [
              {
                label: "Customer view",
                value: "360",
                note: "Customer profile, segment, communication history нэг дор харагдана.",
              },
              {
                label: "Orders",
                value: isPrivilegedUser ? String(orders.length) : "Secured",
                note: "Захиалгын pipeline, service handling, lifecycle mapping.",
              },
              {
                label: "Retention",
                value: "Lifecycle",
                note: "Lead → customer → repeat order урсгалыг дэмжинэ.",
              },
            ],
            architectureNotes: [
              "CRM нь customer identity, order relationship, communication history-г нэгтгэнэ.",
              "Order pipeline нь Website checkout-оос орж ирэх ч CRM дээр service context-оор үргэлжилнэ.",
              "Support inbox, note timeline, customer segmentation дараагийн шатанд энэ модульд орно.",
            ],
            items: [
              {
                id: "crmOverview",
                label: "CRM overview",
                description: "Pipeline, segmentation, customer operating model.",
                icon: <Users size={18} />,
              },
              {
                id: "crmCustomers",
                label: "Харилцагч",
                description: "Customer profile, segment, account health.",
                icon: <UserCircle2 size={18} />,
              },
              {
                id: "orders",
                label: "Захиалга",
                description: "Order review, payment state, fulfillment handoff.",
                icon: <WalletCards size={18} />,
                implemented: true,
                requiresPrivilege: true,
                badge: paidOrdersCount > 0 ? paidOrdersCount : undefined,
              },
              {
                id: "crmService",
                label: "Service inbox",
                description: "Inquiry, issue, comment, escalation handling.",
                icon: <MessageSquareQuote size={18} />,
              },
            ],
          },
          {
            key: "finance",
            label: "Finance",
            description: "Payment control, reconciliation, finance reporting.",
            icon: <WalletCards size={20} />,
            highlights: [
              {
                label: "Ledger model",
                value: "AR/AP",
                note: "Орлого, төлбөр, settlement flow салангид бүртгэгдэнэ.",
              },
              {
                label: "Payments",
                value: "QPAY+",
                note: "Website болон CRM order-оос орж ирэх payment event-үүдийг нэгтгэнэ.",
              },
              {
                label: "Close cycle",
                value: "Monthly",
                note: "Reconciliation, payout, tax-ready report pipeline.",
              },
            ],
            architectureNotes: [
              "Finance модуль нь order payment event-ийг accounting-friendly ledger рүү хувиргана.",
              "Reconciliation нь payment provider, bank statement, order total гуравыг тулгана.",
              "Financial reports нь module бүрийн transaction layer-ийг нэгтгэнэ.",
            ],
            items: [
              {
                id: "financeOverview",
                label: "Finance overview",
                description: "Cashflow, payable, receivable, finance control tower.",
                icon: <WalletCards size={18} />,
              },
              {
                id: "financePayments",
                label: "Төлбөр",
                description: "Payment queue, settlement, exception handling.",
                icon: <CheckCircle2 size={18} />,
              },
              {
                id: "financeReconciliation",
                label: "Reconciliation",
                description: "Provider vs order vs bank statement matching.",
                icon: <RotateCcw size={18} />,
              },
              {
                id: "financeReports",
                label: "Санхүүгийн тайлан",
                description: "Daily, monthly, tax-ready finance reporting.",
                icon: <LayoutDashboard size={18} />,
              },
            ],
          },
          {
            key: "factory",
            label: "Factory",
            description: "Үйлдвэрлэл, нөөц, dispatch, operational execution.",
            icon: <Package size={20} />,
            highlights: [
              {
                label: "Work orders",
                value: "Batch",
                note: "Production batch, BOM, work order lifecycle.",
              },
              {
                label: "Inventory",
                value: "Raw + FG",
                note: "Түүхий эд, сав баглаа, бэлэн бүтээгдэхүүн тусдаа удирдагдана.",
              },
              {
                label: "Dispatch",
                value: "24-48h",
                note: "Warehouse handoff, packing, courier dispatch flow.",
              },
            ],
            architectureNotes: [
              "Factory модуль нь үйлдвэрлэл, inventory, dispatch-г нэг operational domain болгон удирдана.",
              "Order confirmed болмогц CRM/Finance-ээс Factory руу fulfillment signal дамжина.",
              "Production planning, stock reservation, QC checkpoints дараагийн шатанд энд төвлөрнө.",
            ],
            items: [
              {
                id: "factoryOverview",
                label: "Factory overview",
                description: "Plant control tower, capacity, throughput, risk view.",
                icon: <Package size={18} />,
              },
              {
                id: "factoryProduction",
                label: "Үйлдвэрлэл",
                description: "Batch planning, work order, BOM execution.",
                icon: <RotateCcw size={18} />,
              },
              {
                id: "factoryInventory",
                label: "Нөөц ба агуулах",
                description: "Raw material, packaging, finished goods inventory.",
                icon: <Store size={18} />,
              },
              {
                id: "factoryDispatch",
                label: "Dispatch",
                description: "Packing, courier handoff, delivery coordination.",
                icon: <MapPin size={18} />,
              },
            ],
          },
        ]
      : [
          {
            key: "common",
            label: "Common",
            description: "Shared identity, permissions, system settings, and audit controls.",
            icon: <LayoutDashboard size={20} />,
            highlights: [
              {
                label: "Access model",
                value: "RBAC",
                note: "One identity layer governs Website, CRM, Finance, and Factory access.",
              },
              {
                label: "Ops layer",
                value: "Shared",
                note: "System settings, integrations, and activity logs live outside product modules.",
              },
              {
                label: "Current role",
                value: getRoleLabel(role, language),
                note: "Current access level of the signed-in operator.",
              },
            ],
            architectureNotes: [
              "Identity, roles, permissions, and environment settings belong to the shared system core.",
              "Cross-module reports, audit trails, and notifications should stay independent from business modules.",
              "Future tenant, branch, and warehouse policies should be centralized here.",
            ],
            items: [
              {
                id: "dashboard",
                label: copy.dashboard,
                description: "Global health, KPIs, and live system sync.",
                icon: <LayoutDashboard size={18} />,
                implemented: true,
              },
              {
                id: "users",
                label: "Users & roles",
                description: "Identity, roles, and access policy control.",
                icon: <Users size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "commonSettings",
                label: "System settings",
                description: "Environment, tenant, integrations, and global policy.",
                icon: <Pencil size={18} />,
              },
              {
                id: "activityLog",
                label: "Reports & logs",
                description: "Audit trail, activity feed, and cross-module reports.",
                icon: <CheckCircle2 size={18} />,
              },
              {
                id: "products",
                label: "Products",
                description: "SKU, pricing, copy, assets, and status management.",
                icon: <Package size={18} />,
                implemented: true,
              },
              {
                id: "categories",
                label: "Categories",
                description: "Catalog taxonomy and collection structure.",
                icon: <Store size={18} />,
                implemented: true,
              },
            ],
          },
          {
            key: "website",
            label: "Website",
            description: "Public storefront, content, catalog, and merchandising.",
            icon: <Globe size={20} />,
            highlights: [
              {
                label: copy.totalCollections,
                value: `${activeCollections.length}/${collections.length}`,
                note: "Navigation, landing pages, and storefront taxonomy.",
              },
              {
                label: copy.totalProducts,
                value: `${activeProducts.length}/${products.length}`,
                note: "Catalog, pricing, media, and merchandising dataset.",
              },
              {
                label: copy.totalBanners,
                value: `${activeHeroBanners.length}/${heroBanners.length}`,
                note: "Hero, campaign, and editorial surfaces.",
              },
            ],
            architectureNotes: [
              "The Website module owns public content, catalog, and merchandising workflows.",
              "Categories, products, and content hub live under one catalog domain.",
              "Public storefront rendering and admin content lifecycle stay separate but share one source of truth.",
            ],
            items: [
              {
                id: "website",
                label: "Content hub",
                description: "Website settings, banners, markets, and testimonials.",
                icon: <Globe size={18} />,
                implemented: true,
              },
              {
                id: "messages",
                label: copy.messagesMenu,
                description: "Customer messages submitted from the contact form.",
                icon: <MessageSquareQuote size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
            ],
          },
          {
            key: "crm",
            label: "CRM",
            badge: paidOrdersCount > 0 ? paidOrdersCount : undefined,
            description: "Customer 360, order operations, service, and retention workflows.",
            icon: <Users size={20} />,
            highlights: [
              {
                label: "Customer view",
                value: "360",
                note: "Profile, segment, and communication history in one place.",
              },
              {
                label: "Orders",
                value: isPrivilegedUser ? String(orders.length) : "Secured",
                note: "Order pipeline, service handling, and lifecycle mapping.",
              },
              {
                label: "Retention",
                value: "Lifecycle",
                note: "Supports lead → customer → repeat purchase flows.",
              },
            ],
            architectureNotes: [
              "CRM unifies customer identity, order relationships, and communication history.",
              "Website checkout feeds orders into CRM where service operations continue.",
              "Support inbox, note timeline, and segmentation belong in this module next.",
            ],
            items: [
              {
                id: "crmOverview",
                label: "CRM overview",
                description: "Pipeline, segmentation, and customer operating model.",
                icon: <Users size={18} />,
              },
              {
                id: "crmCustomers",
                label: "Customers",
                description: "Customer profile, segment, and account health.",
                icon: <UserCircle2 size={18} />,
              },
              {
                id: "orders",
                label: "Orders",
                description: "Order review, payment state, and fulfillment handoff.",
                icon: <WalletCards size={18} />,
                implemented: true,
                requiresPrivilege: true,
                badge: paidOrdersCount > 0 ? paidOrdersCount : undefined,
              },
              {
                id: "crmService",
                label: "Service inbox",
                description: "Inquiry, issue, comment, and escalation handling.",
                icon: <MessageSquareQuote size={18} />,
              },
            ],
          },
          {
            key: "finance",
            label: "Finance",
            description: "Payment control, reconciliation, and financial reporting.",
            icon: <WalletCards size={20} />,
            highlights: [
              {
                label: "Ledger model",
                value: "AR/AP",
                note: "Receivables, payouts, and settlements are managed independently.",
              },
              {
                label: "Payments",
                value: "QPAY+",
                note: "Unifies payment events arriving from Website and CRM orders.",
              },
              {
                label: "Close cycle",
                value: "Monthly",
                note: "Supports reconciliation, payouts, and tax-ready finance reporting.",
              },
            ],
            architectureNotes: [
              "Finance converts order payment events into an accounting-ready ledger.",
              "Reconciliation matches provider data, bank statements, and order totals.",
              "Financial reports aggregate the transaction layers from every module.",
            ],
            items: [
              {
                id: "financeOverview",
                label: "Finance overview",
                description: "Cashflow, payable, receivable, and finance control tower.",
                icon: <WalletCards size={18} />,
              },
              {
                id: "financePayments",
                label: "Payments",
                description: "Payment queue, settlement, and exception handling.",
                icon: <CheckCircle2 size={18} />,
              },
              {
                id: "financeReconciliation",
                label: "Reconciliation",
                description: "Provider vs order vs bank statement matching.",
                icon: <RotateCcw size={18} />,
              },
              {
                id: "financeReports",
                label: "Financial reports",
                description: "Daily, monthly, and tax-ready finance reporting.",
                icon: <LayoutDashboard size={18} />,
              },
            ],
          },
          {
            key: "factory",
            label: "Factory",
            description: "Production, inventory, dispatch, and execution operations.",
            icon: <Package size={20} />,
            highlights: [
              {
                label: "Work orders",
                value: "Batch",
                note: "Production batches, BOMs, and work order lifecycle.",
              },
              {
                label: "Inventory",
                value: "Raw + FG",
                note: "Raw materials, packaging, and finished goods stay separated.",
              },
              {
                label: "Dispatch",
                value: "24-48h",
                note: "Warehouse handoff, packing, and courier dispatch flow.",
              },
            ],
            architectureNotes: [
              "Factory owns production, inventory, and dispatch as one operational domain.",
              "Confirmed orders should hand off from CRM and Finance into Factory fulfillment.",
              "Production planning, stock reservation, and QC checkpoints belong here next.",
            ],
            items: [
              {
                id: "factoryOverview",
                label: "Factory overview",
                description: "Plant control tower, capacity, throughput, and risk view.",
                icon: <Package size={18} />,
              },
              {
                id: "factoryProduction",
                label: "Production",
                description: "Batch planning, work orders, and BOM execution.",
                icon: <RotateCcw size={18} />,
              },
              {
                id: "factoryInventory",
                label: "Inventory",
                description: "Raw material, packaging, and finished goods stock.",
                icon: <Store size={18} />,
              },
              {
                id: "factoryDispatch",
                label: "Dispatch",
                description: "Packing, courier handoff, and delivery coordination.",
                icon: <MapPin size={18} />,
              },
            ],
          },
        ];
  const activeMenuGroup = adminMenuGroups.find((group) => group.items.some((item) => item.id === activeSection));
  const activeMenuItem = activeMenuGroup?.items.find((item) => item.id === activeSection) ?? null;
  const architectureSection = activeMenuItem && !implementedSections.has(activeMenuItem.id) ? activeMenuItem : null;

  const toggleNavGroup = (groupKey: AdminMenuGroup["key"]) => {
    setOpenNavGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

  useEffect(() => {
    if (!isPrivilegedUser) {
      setDirectoryUsers([]);
      setDirectoryError(null);
      return;
    }

    return subscribeToUserProfiles({
      onData: (profiles) => {
        setDirectoryUsers(profiles);
        setDirectoryError(null);
      },
      onError: (subscriptionError) => {
        setDirectoryError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setOrders([]);
      setOrdersError(null);
      return;
    }

    return subscribeToOrders({
      onData: (nextOrders) => {
        setOrders(nextOrders);
        setOrdersError(null);
      },
      onError: (subscriptionError) => {
        setOrdersError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setContactMessages([]);
      setContactMessagesError(null);
      return;
    }

    return subscribeToContactMessages({
      onData: (nextMessages) => {
        setContactMessages(nextMessages);
        setContactMessagesError(null);
      },
      onError: (subscriptionError) => {
        setContactMessagesError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (isPrivilegedUser || !user) {
      setMyOrders([]);
      setMyOrdersError(null);
      return;
    }

    return subscribeToUserOrders({
      uid: user.uid,
      onData: (nextOrders) => {
        setMyOrders(nextOrders);
        setMyOrdersError(null);
      },
      onError: (subscriptionError) => {
        setMyOrdersError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser, user]);

  useEffect(() => {
    if (!isPrivilegedUser && (activeSection === "users" || activeSection === "orders" || activeSection === "messages")) {
      setActiveSection("dashboard");
    }
  }, [activeSection, isPrivilegedUser]);

  useEffect(() => {
    if (!activeMenuGroup || openNavGroups[activeMenuGroup.key]) {
      return;
    }

    setOpenNavGroups((current) => ({
      ...current,
      [activeMenuGroup.key]: true,
    }));
  }, [activeMenuGroup, openNavGroups]);

  const openSettingsModal = () => {
    setSettingsModal({ draft: cloneShopSettings(settings) });
  };

  const saveSettingsSection = (updater: (draft: ShopSettings) => ShopSettings) => {
    saveSettingsDraft(updater(cloneShopSettings(settings)));
  };

  const openNavigationModal = (item: SiteNavigationItem) => {
    setNavigationBannerUploadError(null);
    setNavigationBannerUploading(false);
    setNavigationModal({
      mode: item.status === "inactive" ? "create" : "edit",
      draft: { ...item },
    });
  };

  const handleNavigationDeleteRequest = (item: SiteNavigationItem) => {
    setConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteNavigationDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => {
        saveSettingsSection((draft) => ({
          ...draft,
          navigationItems: draft.navigationItems.map((navigationItem) =>
            navigationItem.id === item.id ? { ...navigationItem, status: "inactive" } : navigationItem
          ),
        }));
        setConfirmModal(null);
      },
    });
  };

  const openJournalEntryModal = (entry?: JournalEntry) => {
    setJournalImageUploadError(null);
    setJournalImageUploading(false);

    if (entry) {
      setJournalEntryModal({
        mode: "edit",
        draft: { ...entry },
      });
      return;
    }

    const nextId = Math.max(0, ...settings.journalEntries.map((item) => item.id)) + 1;
    setJournalEntryModal({
      mode: "create",
      draft: {
        id: nextId,
        titleEn: "",
        titleMn: "",
        excerptEn: "",
        excerptMn: "",
        categoryEn: "",
        categoryMn: "",
        author: "",
        publishedAt: new Date().toISOString().slice(0, 10),
        image: "",
        status: "active",
      },
    });
  };

  const openJournalSettingsModal = () => {
    setJournalSettingsModal({
      journalHeadingMn: settings.journalHeadingMn,
      journalHeadingEn: settings.journalHeadingEn,
      journalSubtextMn: settings.journalSubtextMn,
      journalSubtextEn: settings.journalSubtextEn,
    });
  };

  const handleJournalEntryDeleteRequest = (entry: JournalEntry) => {
    setConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteJournalEntryDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => {
        saveSettingsSection((draft) => ({
          ...draft,
          journalEntries: draft.journalEntries.filter((journalEntry) => journalEntry.id !== entry.id),
        }));
        setConfirmModal(null);
      },
    });
  };

  const openCollectionModal = (collection?: Collection) => {
    if (collection) {
      setCollectionModal({
        mode: "edit",
        draft: { ...collection },
      });
      return;
    }

    const nextId = Math.max(0, ...collections.map((item) => item.id)) + 1;
    setCollectionModal({
      mode: "create",
      draft: {
        id: nextId,
        name: "",
        slug: "",
        description: "",
        gradient: DEFAULT_COLLECTION_GRADIENT,
        image: "",
        status: "active",
      },
    });
  };

  const openProductModal = (product?: Product) => {
    if (product) {
      const nextCategory =
        selectableCategories.some((collection) => collection.slug === product.category)
          ? product.category
          : selectableCategories[0]?.slug ?? product.category;

      setProductModal({
        mode: "edit",
        draft: {
          ...cloneProduct(product),
          category: nextCategory,
          variants: cloneVariants(product.variants),
        },
      });
      return;
    }

    const nextId = Math.max(0, ...products.map((item) => item.id)) + 1;
    setProductModal({
      mode: "create",
      draft: {
        id: nextId,
        name: "",
        price: 0,
        description: "",
        category: selectableCategories[0]?.slug ?? "",
        images: [""],
        status: "active",
      },
    });
  };

  const handleProductImageUpload = async (event: ChangeEvent<HTMLInputElement>, imageIndex: number) => {
    const file = event.target.files?.[0];

    if (!file || !productModal) {
      return;
    }

    if (imageIndex >= 3) {
      return;
    }

    setProductImageUploadError(null);
    setProductImageUploading(true);

    try {
      const uploadedImageUrl = await uploadStorefrontImage(file, "product-images");
      setProductModal((current) => {
        if (!current) return current;
        const nextImages = [...current.draft.images];
        nextImages[imageIndex] = uploadedImageUrl;
        return {
          ...current,
          draft: { ...current.draft, images: nextImages },
        };
      });
    } catch {
      setProductImageUploadError(copy.bannerUploadFailed);
    } finally {
      setProductImageUploading(false);
      event.target.value = "";
    }
  };

  const removeProductImage = (imageIndex: number) => {
    if (!productModal) return;
    const nextImages = productModal.draft.images.filter((_, i) => i !== imageIndex);
    setProductModal({
      ...productModal,
      draft: { ...productModal.draft, images: nextImages.length > 0 ? nextImages : [""] },
    });
  };

  const openHeroBannerModal = (heroBanner?: HeroBanner) => {
    setBannerUploadError(null);

    if (heroBanner) {
      setHeroBannerModal({
        mode: "edit",
        draft: { ...heroBanner },
      });
      return;
    }

    const nextId = Math.max(0, ...heroBanners.map((item) => item.id)) + 1;
    setHeroBannerModal({
      mode: "create",
      draft: {
        id: nextId,
        collectionSlug: bannerCategories[0]?.slug ?? "",
        image: "",
        source: "admin",
        status: "active",
      },
    });
  };

  const openMarketModal = (market?: MarketItem) => {
    if (market) {
      setMarketModal({ mode: "edit", draft: { ...market } });
      return;
    }

    const nextId = Math.max(0, ...markets.map((item) => item.id)) + 1;
    setMarketModal({
      mode: "create",
      draft: {
        id: nextId,
        name: "",
        schedule: "",
        address: "",
        season: "",
        status: "active",
      },
    });
  };

  const openTestimonialModal = (testimonial?: Testimonial) => {
    if (testimonial) {
      setTestimonialModal({ mode: "edit", draft: { ...testimonial } });
      return;
    }

    const nextId = Math.max(0, ...testimonials.map((item) => item.id)) + 1;
    setTestimonialModal({
      mode: "create",
      draft: {
        id: nextId,
        text: "",
        author: "",
        location: "",
        status: "active",
      },
    });
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  const openConfirmModal = (state: ConfirmModalState) => {
    setConfirmModal(state);
  };

  const getCollectionDeleteBlockReason = (collection: Collection) => {
    if (isSystemCollection(collection)) {
      return copy.categoryDeleteLocked;
    }

    if (regularCollectionCount <= 1) {
      return copy.categoryLastLocked;
    }

    if ((productCountByCategory.get(collection.slug) ?? 0) > 0) {
      return copy.categoryDependencyError;
    }

    if (heroBanners.some((heroBanner) => heroBanner.collectionSlug === collection.slug)) {
      return copy.bannerDependencyError;
    }

    return null;
  };

  const handleCollectionDeleteRequest = (collection: Collection) => {
    const blockedReason = getCollectionDeleteBlockReason(collection);

    if (blockedReason) {
      openConfirmModal({
        title: copy.confirmDeleteTitle,
        description: blockedReason,
        confirmLabel: copy.close,
        onConfirm: () => {},
      });
      return;
    }

    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteCollectionDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => deleteCollection(collection.id),
    });
  };

  const handleProductDeleteRequest = (product: Product) => {
    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteProductDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => deleteProduct(product.id),
    });
  };

  const handleHeroBannerDeleteRequest = (heroBanner: HeroBanner) => {
    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteBannerDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => deleteHeroBanner(heroBanner.id),
    });
  };

  const handleMarketDeleteRequest = (market: MarketItem) => {
    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteMarketDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => deleteMarket(market.id),
    });
  };

  const handleTestimonialDeleteRequest = (testimonial: Testimonial) => {
    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteTestimonialDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: () => deleteTestimonial(testimonial.id),
    });
  };

  const handleNavigationBannerFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !navigationModal) {
      return;
    }

    setNavigationBannerUploadError(null);
    setNavigationBannerUploading(true);

    try {
      const uploadedImageUrl = await uploadStorefrontImage(file, "navigation-banners");
      setNavigationModal((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                pageBannerImage: uploadedImageUrl,
              },
            }
          : current
      );
    } catch {
      setNavigationBannerUploadError(copy.bannerUploadFailed);
    } finally {
      setNavigationBannerUploading(false);
      event.target.value = "";
    }
  };

  const closeNavigationModal = () => {
    if (navigationBannerUploading) {
      return;
    }

    setNavigationModal(null);
    setNavigationBannerUploadError(null);
    setNavigationBannerUploading(false);
  };

  const handleHeroBannerFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !heroBannerModal) {
      return;
    }

    setBannerUploadError(null);
    setBannerUploading(true);

    try {
      const uploadedImageUrl = await uploadStorefrontImage(file, "hero-banners");
      setHeroBannerModal((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                image: uploadedImageUrl,
                source: "admin",
              },
            }
          : current
      );
    } catch {
      setBannerUploadError(copy.bannerUploadFailed);
    } finally {
      setBannerUploading(false);
      event.target.value = "";
    }
  };

  const closeHeroBannerModal = () => {
    if (bannerUploading) {
      return;
    }

    setHeroBannerModal(null);
    setBannerUploadError(null);
    setBannerUploading(false);
  };

  const handleJournalEntryFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file || !journalEntryModal) {
      return;
    }

    setJournalImageUploadError(null);
    setJournalImageUploading(true);

    try {
      const uploadedImageUrl = await uploadStorefrontImage(file, "journal-images");
      setJournalEntryModal((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                image: uploadedImageUrl,
              },
            }
          : current
      );
    } catch {
      setJournalImageUploadError(copy.bannerUploadFailed);
    } finally {
      setJournalImageUploading(false);
      event.target.value = "";
    }
  };

  const closeJournalEntryModal = () => {
    if (journalImageUploading) {
      return;
    }

    setJournalEntryModal(null);
    setJournalImageUploadError(null);
    setJournalImageUploading(false);
  };

  const openUserProfileModal = (directoryUser: UserProfile) => {
    setSavingUserProfile(false);
    setUserProfileError(null);
    setUserProfileModal({
      draft: {
        ...directoryUser,
        role: resolveUserRole(directoryUser),
      },
    });
  };

  const closeUserProfileModal = () => {
    if (savingUserProfile) {
      return;
    }

    setUserProfileModal(null);
    setUserProfileError(null);
  };

  const openOrderModal = (order: OrderRecord) => {
    setOrderModal({ draft: cloneOrderRecord(order) });
    setOrderModalError(null);
  };

  const closeOrderModal = () => {
    if (savingOrderModal) {
      return;
    }

    setOrderModal(null);
    setOrderModalError(null);
  };

  const handleOrderCustomerChange =
    (field: keyof OrderRecord["customer"]) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setOrderModal((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                customer: {
                  ...current.draft.customer,
                  [field]: nextValue,
                },
              },
            }
          : current
      );
    };

  const handleOrderAddressChange =
    (field: keyof OrderRecord["address"]) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setOrderModal((current) =>
        current
          ? {
              ...current,
              draft: {
                ...current.draft,
                address: {
                  ...current.draft.address,
                  [field]: nextValue,
                },
              },
            }
          : current
      );
    };

  const handleOrderStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = event.target.value as OrderStatus;
    setOrderModal((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              status: nextStatus,
            },
          }
        : current
    );
  };

  const handleOrderModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!orderModal) {
      return;
    }

    const nextCustomer = {
      fullName: orderModal.draft.customer.fullName.trim(),
      phoneNumber: orderModal.draft.customer.phoneNumber.trim(),
      email: orderModal.draft.customer.email?.trim() ? orderModal.draft.customer.email.trim() : null,
      note: orderModal.draft.customer.note.trim(),
    };
    const nextAddress = {
      region: orderModal.draft.address.region.trim(),
      districtOrSoum: orderModal.draft.address.districtOrSoum.trim(),
      khorooOrBag: orderModal.draft.address.khorooOrBag.trim(),
      streetAddress: orderModal.draft.address.streetAddress.trim(),
      additionalAddress: orderModal.draft.address.additionalAddress.trim(),
    };

    if (
      !nextCustomer.fullName ||
      !nextCustomer.phoneNumber ||
      !nextAddress.region ||
      !nextAddress.districtOrSoum ||
      !nextAddress.khorooOrBag ||
      !nextAddress.streetAddress
    ) {
      setOrderModalError(copy.orderUpdateFailed);
      return;
    }

    setSavingOrderModal(true);
    setOrderModalError(null);

    try {
      const originalOrder = orders.find((o) => o.id === orderModal.draft.id);
      const isNewlyDelivered =
        orderModal.draft.status === "delivered" &&
        originalOrder != null &&
        originalOrder.status !== "delivered";

      await updateOrderByAdmin(orderModal.draft.id, {
        status: orderModal.draft.status,
        customer: nextCustomer,
        address: nextAddress,
        payment: orderModal.draft.payment,
      });

      if (isNewlyDelivered && originalOrder) {
        for (const item of originalOrder.items) {
          const currentProduct = products.find((p) => p.id === item.productId);
          if (currentProduct) {
            const updatedVariants = currentProduct.variants?.map((v) =>
              v.name === item.variant
                ? { ...v, soldCount: (v.soldCount ?? 0) + item.quantity }
                : v
            );
            updateProduct(item.productId, {
              soldCount: (currentProduct.soldCount ?? 0) + item.quantity,
              ...(updatedVariants ? { variants: updatedVariants } : {}),
            });
          }
        }
      }

      setOrderModal(null);
      setOrderModalError(null);
    } catch (error) {
      setOrderModalError(error instanceof Error ? error.message : copy.orderUpdateFailed);
    } finally {
      setSavingOrderModal(false);
    }
  };

  const handleUserProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userProfileModal) {
      return;
    }

    setSavingUserProfile(true);
    setUserProfileError(null);

    try {
      await updateUserProfileByPrivileged(userProfileModal.draft.uid, {
        displayName: userProfileModal.draft.displayName,
        email: userProfileModal.draft.email,
        phoneNumber: userProfileModal.draft.phoneNumber,
        role: userProfileModal.draft.role,
      });
      setUserProfileModal(null);
      setUserProfileError(null);
    } catch (error) {
      setUserProfileError(error instanceof Error ? error.message : copy.userUpdateFailed);
    } finally {
      setSavingUserProfile(false);
    }
  };

  if (!isPrivilegedUser) {
    return (
      <div className="customer-account-page">
        <div className="customer-account-container">
          <div className="customer-account-header">
            <h1>{language === "MN" ? "Миний бүртгэл" : "My Account"}</h1>
          </div>

          <div className="customer-account-grid">
            <div className="customer-profile-card">
              <h2>{language === "MN" ? "Профайл" : "Profile"}</h2>
              <div className="customer-profile-info">
                <div className="customer-profile-row">
                  <span>{language === "MN" ? "Нэр" : "Name"}</span>
                  <strong>{profile?.displayName || "-"}</strong>
                </div>
                <div className="customer-profile-row">
                  <span>{language === "MN" ? "Утас" : "Phone"}</span>
                  <strong>{profile?.phoneNumber || user?.phoneNumber || "-"}</strong>
                </div>
                <div className="customer-profile-row">
                  <span>{language === "MN" ? "И-мэйл" : "Email"}</span>
                  <strong>{profile?.email || user?.email || "-"}</strong>
                </div>
                <div className="customer-profile-row">
                  <span>{language === "MN" ? "Бүртгүүлсэн" : "Registered"}</span>
                  <strong>{formatAdminDateTime(profile?.registeredAt ?? null, language)}</strong>
                </div>
              </div>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: "1rem" }} onClick={logout}>
                {language === "MN" ? "Гарах" : "Sign out"}
              </button>
            </div>

            {cartItems.length > 0 && (
              <div className="customer-cart-card">
                <h2>{language === "MN" ? "Миний сагс" : "My Cart"} <small>({cartTotalItems})</small></h2>
                <div className="customer-cart-items">
                  {cartItems.map((item, idx) => (
                    <div key={idx} className="customer-cart-item">
                      <div className="customer-order-product-thumb">
                        {item.product.images?.[0] ? <img src={item.product.images[0]} alt={item.product.name} /> : <span>{item.product.name.slice(0, 1)}</span>}
                      </div>
                      <div className="customer-cart-item-body">
                        <div className="customer-order-product-info">
                          <span>{item.product.name}</span>
                          <small>{item.variant ? `${item.variant} · ` : ""}{formatStorePrice(item.unitPrice)}</small>
                        </div>
                        <div className="customer-cart-item-controls">
                          <div className="customer-cart-qty">
                            <button type="button" onClick={() => updateCartQuantity(item.product.id, item.quantity - 1, item.variant)}>−</button>
                            <span>{item.quantity}</span>
                            <button type="button" onClick={() => updateCartQuantity(item.product.id, item.quantity + 1, item.variant)}>+</button>
                          </div>
                          <strong>{formatStorePrice(item.unitPrice * item.quantity)}</strong>
                          <button type="button" className="customer-cart-remove" onClick={() => removeCartItem(item.product.id, item.variant)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="customer-cart-footer">
                  <div className="customer-order-totals-row customer-order-grand">
                    <span>{language === "MN" ? "Нийт" : "Total"}</span>
                    <strong>{formatStorePrice(cartTotalPrice)}</strong>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => navigate("/checkout")}>
                    {language === "MN" ? "Захиалга өгөх" : "Checkout"}
                  </button>
                </div>
              </div>
            )}

            <div className="customer-orders-card">
              <h2>{language === "MN" ? "Миний захиалгууд" : "My Orders"} {myOrders.length > 0 && <small>({myOrders.length})</small>}</h2>
              {myOrdersError && <p className="customer-error">{myOrdersError}</p>}
              {myOrders.length === 0 ? (
                <p className="customer-empty">{language === "MN" ? "Захиалга байхгүй байна" : "No orders yet"}</p>
              ) : (
                <div className="customer-orders-list">
                  {myOrders.map((order) => (
                    <div key={order.id} className="customer-order-item">
                      <div className="customer-order-head">
                        <div>
                          <strong>{order.orderNumber}</strong>
                          <small>{formatAdminDateTime(order.createdAt, language)}</small>
                        </div>
                        <span className={getOrderStatusClassName(order.status)}>
                          {getOrderStatusLabel(order.status, language)}
                        </span>
                      </div>
                      <div className="customer-order-products">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="customer-order-product">
                            <div className="customer-order-product-thumb">
                              {item.image ? <img src={item.image} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                            </div>
                            <div className="customer-order-product-info">
                              <span>{item.name}</span>
                              <small>{item.variant ? `${item.variant} · ` : ""}{item.quantity} x {formatStorePrice(item.unitPrice)}</small>
                            </div>
                            <strong>{formatStorePrice(item.lineTotal)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="customer-order-footer">
                        <div className="customer-order-totals-row">
                          <span>{language === "MN" ? "Хүргэлт" : "Shipping"}</span>
                          <span>{formatStorePrice(order.totals.shippingFee)}</span>
                        </div>
                        <div className="customer-order-totals-row customer-order-grand">
                          <span>{language === "MN" ? "Нийт" : "Total"}</span>
                          <strong>{formatStorePrice(order.totals.grandTotal)}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className={`admin-shell ${sidebarOpen ? "" : "admin-shell-collapsed"}`}>
        <aside className={`admin-sidebar ${sidebarOpen ? "" : "admin-sidebar-hidden"}`}>
          <div className="admin-sidebar-brand">
            <img src={logoBlack} alt="Savana" className="admin-sidebar-logo" />
            <strong>{visibleSettings.brandName}</strong>
          </div>

          <nav className="admin-nav">
            {adminMenuGroups.map((group) => {
              const visibleItems = group.items.filter((item) => !item.requiresPrivilege || isPrivilegedUser);
              const isOpen = openNavGroups[group.key];
              const isGroupActive = activeMenuGroup?.key === group.key;

              return (
                <div key={group.key} className={`admin-nav-group ${isOpen ? "open" : ""}`} data-module={group.key}>
                  <button
                    type="button"
                    className={`admin-nav-parent ${isGroupActive ? "active" : ""}`}
                    onClick={() => toggleNavGroup(group.key)}
                    aria-expanded={isOpen}
                  >
                    <span className="admin-nav-parent-main">
                      <span className="admin-nav-parent-icon">{group.icon}</span>
                      <span className="admin-nav-parent-label">{group.label}</span>
                      {group.badge != null && group.badge > 0 && <span className="admin-nav-badge">{group.badge}</span>}
                    </span>
                    <span className="admin-nav-parent-toggle">
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="admin-nav-children">
                      {visibleItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`admin-nav-child ${activeSection === item.id ? "active" : ""}`}
                          onClick={() => setActiveSection(item.id)}
                        >
                          <span className="admin-nav-child-dot" />
                          <span className="admin-nav-child-label">{item.label}</span>
                          {item.badge != null && item.badge > 0 && <span className="admin-nav-badge">{item.badge}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-user-card">
              <div className="admin-user-head">
                <UserCircle2 size={28} />
                <div>
                  <span>{copy.signedIn}</span>
                  <strong>{profile?.phoneNumber ?? profile?.email ?? user?.phoneNumber ?? user?.email ?? user?.displayName ?? user?.uid}</strong>
                </div>
              </div>
              <div className="admin-user-status">
                <span>{language === "MN" ? "Эрх" : "Role"}</span>
                <strong>{getRoleLabel(role, language)}</strong>
              </div>
              <div className="admin-user-status">
                <span>{language === "MN" ? "Төрөл" : "Type"}</span>
                <strong>{getAuthMethodLabel(currentRegistrationMethod, language)}</strong>
              </div>
            </div>

            <div className="admin-language-switch">
              <span>{copy.language}</span>
              <div className="admin-language-actions">
                <button
                  type="button"
                  className={`admin-language-btn ${language === "MN" ? "active" : ""}`}
                  onClick={() => setLanguage("MN")}
                >
                  {copy.mongolian}
                </button>
                <button
                  type="button"
                  className={`admin-language-btn ${language === "EN" ? "active" : ""}`}
                  onClick={() => setLanguage("EN")}
                >
                  {copy.english}
                </button>
              </div>
            </div>

            <button type="button" className="btn btn-outline admin-logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              {loggingOut ? "..." : copy.logout}
            </button>
          </div>
        </aside>

        <section className="admin-content">
          <button
            type="button"
            className="admin-sidebar-toggle"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          {activeSection === "dashboard" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.quickOverview}</p>
                  <h1>{copy.dashboardTitle}</h1>
                  <p>{copy.dashboardText}</p>
                </div>
              </div>

              <div className="admin-stat-grid">
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="website"
                  onClick={() => setActiveSection("products")}
                  aria-label={copy.openProducts}
                >
                  <span>{copy.totalProducts}</span>
                  <strong>{activeProducts.length}/{products.length}</strong>
                  <small>{copy.statusSummary}</small>
                </button>
                {isPrivilegedUser && (
                  <button
                    type="button"
                    className="admin-stat-card admin-stat-card-link admin-module-card"
                    data-module="crm"
                    onClick={() => setActiveSection("orders")}
                    aria-label={copy.openOrders}
                  >
                    <span>{copy.totalOrders}</span>
                    <strong>{orders.length}</strong>
                    <small>{copy.ordersText}</small>
                  </button>
                )}
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="website"
                  onClick={() => setActiveSection("categories")}
                  aria-label={copy.openCategories}
                >
                  <span>{copy.totalCollections}</span>
                  <strong>{activeCollections.length}/{collections.length}</strong>
                  <small>{copy.statusSummary}</small>
                </button>
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="website"
                  onClick={() => setActiveSection("website")}
                  aria-label={copy.openWebsite}
                >
                  <span>{copy.totalBanners}</span>
                  <strong>{activeHeroBanners.length}/{heroBanners.length}</strong>
                  <small>{copy.bannerSummary}</small>
                </button>
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="website"
                  onClick={() => setActiveSection("website")}
                  aria-label={copy.openWebsite}
                >
                  <span>{copy.totalMarkets}</span>
                  <strong>{activeMarkets.length}/{markets.length}</strong>
                  <small>{copy.statusSummary}</small>
                </button>
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="website"
                  onClick={() => setActiveSection("website")}
                  aria-label={copy.openWebsite}
                >
                  <span>{copy.totalTestimonials}</span>
                  <strong>{activeTestimonials.length}/{testimonials.length}</strong>
                  <small>{copy.statusSummary}</small>
                </button>
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="common"
                  onClick={() => setActiveSection("website")}
                  aria-label={language === "MN" ? "Вэб контент руу очих" : "Open website content"}
                >
                  <span>{copy.firebaseSync}</span>
                  <strong>
                    {error
                      ? copy.syncError
                      : loading
                        ? copy.syncLoading
                        : saving
                          ? copy.syncSaving
                          : copy.syncLive}
                  </strong>
                </button>
                <button
                  type="button"
                  className="admin-stat-card admin-stat-card-link admin-module-card"
                  data-module="common"
                  onClick={() => setActiveSection("website")}
                  aria-label={language === "MN" ? "Вэб контент руу очих" : "Open website content"}
                >
                  <span>{copy.firestoreStructure}</span>
                  <strong>{backend}</strong>
                </button>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{language === "MN" ? "Системийн модуль архитектур" : "System module architecture"}</h2>
                    <p>
                      {language === "MN"
                        ? "Нийтлэг цэсүүд болон Website, CRM, Finance, Factory module-ууд нэг sidebar navigation дээр төвлөрсөн бүтэц."
                        : "A unified sidebar architecture for shared menus plus the Website, CRM, Finance, and Factory modules."}
                    </p>
                  </div>
                </div>
                <div className="admin-architecture-grid">
                  {adminMenuGroups.map((group) => {
                    const visibleItems = group.items.filter((item) => !item.requiresPrivilege || isPrivilegedUser);

                    return (
                      <div key={group.key} className="admin-architecture-card admin-module-card" data-module={group.key}>
                        <span>{group.label}</span>
                        <strong>{visibleItems.length}</strong>
                        <p>{group.description}</p>
                        <div className="admin-architecture-list">
                          {visibleItems.map((item) => (
                            <small key={item.id}>{item.label}</small>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.livePreview}</h2>
                    <p>{copy.statusSummary}</p>
                  </div>
                </div>
                <div className="admin-preview-grid">
                  <div className="admin-preview-item">
                    <Store size={18} />
                    <div>
                      <span>{copy.brandName}</span>
                      <strong>{visibleSettings.brandName}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <Package size={18} />
                    <div>
                      <span>{copy.heroHeading}</span>
                      <strong>{visibleSettings.heroHeading}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <Images size={18} />
                    <div>
                      <span>{copy.banners}</span>
                      <strong>{activeHeroBanners[0] ? collectionNameBySlug.get(activeHeroBanners[0].collectionSlug) ?? "-" : "-"}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <MapPin size={18} />
                    <div>
                      <span>{copy.location}</span>
                      <strong>{visibleSettings.location}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <MessageSquareQuote size={18} />
                    <div>
                      <span>{copy.testimonials}</span>
                      <strong>{activeTestimonials[0]?.author ?? "-"}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.firestoreStructure}</h2>
                    <p>
                      {language === "MN"
                        ? "Firestore path-ууд болон active-only public visibility логик."
                        : "Firestore paths and active-only public visibility logic."}
                    </p>
                  </div>
                </div>
                <div className="admin-structure-list">
                  <code>{structure.site}</code>
                  <code>{structure.settings}</code>
                  <code>{structure.collections}</code>
                  <code>{structure.products}</code>
                  <code>{structure.orders}</code>
                  <code>{structure.contactMessages}</code>
                  <code>{structure.heroBanners}</code>
                  <code>{structure.markets}</code>
                  <code>{structure.testimonials}</code>
                </div>
                {error && <div className="admin-sync-error">{error}</div>}
              </div>
            </>
          ) : architectureSection && activeMenuGroup ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{activeMenuGroup.label}</p>
                  <h1>{architectureSection.label}</h1>
                  <p>{architectureSection.description}</p>
                </div>
                <div className="admin-topbar-actions">
                  {activeMenuGroup.items
                    .filter((item) => implementedSections.has(item.id) && (!item.requiresPrivilege || isPrivilegedUser))
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="btn btn-outline"
                        onClick={() => setActiveSection(item.id)}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    ))}
                </div>
              </div>

                <div className="admin-summary-grid">
                  {activeMenuGroup.highlights.map((highlight) => (
                    <div
                      key={highlight.label}
                      className="admin-summary-card admin-module-card"
                      data-module={activeMenuGroup.key}
                    >
                      <span>{highlight.label}</span>
                      <strong>{highlight.value}</strong>
                      <small>{highlight.note}</small>
                    </div>
                  ))}
                </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{language === "MN" ? "Module submenu зураглал" : "Module submenu map"}</h2>
                    <p>
                      {language === "MN"
                        ? "Энэ модуль дотор ямар operational block-ууд багтахыг sidebar structure-аар харуулж байна."
                        : "This sidebar structure maps the operational blocks that belong inside the module."}
                    </p>
                  </div>
                </div>
                <div className="admin-architecture-grid">
                  {activeMenuGroup.items
                    .filter((item) => !item.requiresPrivilege || isPrivilegedUser)
                    .map((item) => (
                      <div
                        key={item.id}
                        className={`admin-architecture-card admin-module-card ${item.id === activeSection ? "active" : ""}`}
                        data-module={activeMenuGroup.key}
                      >
                        <span>
                          {item.implemented
                            ? language === "MN"
                              ? "Ажиллаж буй хэсэг"
                              : "Live section"
                            : language === "MN"
                              ? "Архитектурын blueprint"
                              : "Architecture blueprint"}
                        </span>
                        <strong>{item.label}</strong>
                        <p>{item.description}</p>
                      </div>
                    ))}
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{language === "MN" ? "Архитектурын зарчим" : "Architecture principles"}</h2>
                    <p>
                      {language === "MN"
                        ? "Дараагийн хөгжүүлэлтүүдийг энэ module boundary болон data ownership дагуу салгаж өргөжүүлнэ."
                        : "Future development should expand along these module boundaries and data ownership rules."}
                    </p>
                  </div>
                </div>
                <div className="admin-structure-list">
                  {activeMenuGroup.architectureNotes.map((note) => (
                    <code key={note}>{note}</code>
                  ))}
                </div>
              </div>
            </>
          ) : activeSection === "website" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.website}</p>
                  <h1>{copy.websiteTitle}</h1>
                  <p>{copy.websiteText}</p>
                </div>
                <div className="admin-topbar-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => openHeroBannerModal()}
                    disabled={bannerCategories.length === 0}
                  >
                    <Images size={16} />
                    {copy.createBanner}
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn admin-icon-btn-neutral"
                    onClick={openSettingsModal}
                    aria-label={copy.editWebsite}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              </div>

              <div className="admin-summary-grid">
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.settings}</strong>
                    <StatusBadge
                      status={settings.status}
                      activeLabel={copy.active}
                      inactiveLabel={copy.inactive}
                    />
                  </div>
                  <p>{settings.brandName}</p>
                  <small>{copy.settingsInactiveNote}</small>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.navigation}</strong>
                    <span>{activeNavigationItems.length}/{settings.navigationItems.length}</span>
                  </div>
                  <p>{copy.navigationSummary}</p>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.journal}</strong>
                    <span>{activeJournalEntries.length}/{settings.journalEntries.length}</span>
                  </div>
                  <p>{copy.journalSummary}</p>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.banners}</strong>
                    <span>{activeHeroBanners.length}/{heroBanners.length}</span>
                  </div>
                  <p>{copy.bannerSummary}</p>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.markets}</strong>
                    <span>{activeMarkets.length}/{markets.length}</span>
                  </div>
                  <p>{copy.marketSummary}</p>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.testimonials}</strong>
                    <span>{activeTestimonials.length}/{testimonials.length}</span>
                  </div>
                  <p>{copy.testimonialSummary}</p>
                </div>
                {isPrivilegedUser ? (
                  <div className="admin-summary-card">
                    <div className="admin-inline-card-head">
                      <strong>{copy.messagesMenu}</strong>
                      <span>{contactMessages.length}</span>
                    </div>
                    <p>{copy.messagesSummary}</p>
                  </div>
                ) : null}
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{copy.banners}</h2>
                    <p>{copy.bannerSummary}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openHeroBannerModal()}
                    disabled={bannerCategories.length === 0}
                  >
                    <Plus size={16} />
                    {copy.createBanner}
                  </button>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>{copy.bannerImage}</th>
                        <th>{copy.bannerCollection}</th>
                        <th>{copy.status}</th>
                        <th>{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {heroBanners.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="admin-table-empty">
                            {copy.bannerSummary}
                          </td>
                        </tr>
                      ) : (
                        heroBanners.map((heroBanner) => (
                          <tr key={heroBanner.id}>
                            <td>
                              <div className="admin-table-primary-row">
                                <div className="admin-product-thumb">
                                  {heroBanner.image ? (
                                    <img src={heroBanner.image} alt={collectionNameBySlug.get(heroBanner.collectionSlug) ?? copy.banners} />
                                  ) : (
                                    <span>B</span>
                                  )}
                                </div>
                                <div className="admin-table-primary">
                                  <strong>{collectionNameBySlug.get(heroBanner.collectionSlug) ?? "-"}</strong>
                                  <small>
                                    #{heroBanner.id} • {heroBanner.source === "prairiesoapshack.com" ? copy.bannerImportedSource : copy.bannerUploadedSource}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{collectionNameBySlug.get(heroBanner.collectionSlug) ?? heroBanner.collectionSlug}</td>
                            <td>
                              <StatusBadge
                                status={heroBanner.status}
                                activeLabel={copy.active}
                                inactiveLabel={copy.inactive}
                              />
                            </td>
                            <td>
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  onClick={() => openHeroBannerModal(heroBanner)}
                                  aria-label={`${copy.edit} ${heroBanner.id}`}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="admin-icon-btn"
                                  onClick={() => handleHeroBannerDeleteRequest(heroBanner)}
                                  aria-label={`${copy.delete} ${heroBanner.id}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {bannerCategories.length === 0 && <div className="admin-sync-error">{copy.noCategories}</div>}
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.settings}</h2>
                    <p>{copy.settingsInactiveNote}</p>
                  </div>
                  <button
                    type="button"
                    className="admin-icon-btn admin-icon-btn-neutral"
                    onClick={openSettingsModal}
                    aria-label={copy.edit}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <div className="admin-preview-grid">
                  <div className="admin-preview-item">
                    <Store size={18} />
                    <div>
                      <span>{copy.brandName}</span>
                      <strong>{settings.brandName}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <Package size={18} />
                    <div>
                      <span>{copy.heroHeading}</span>
                      <strong>{settings.heroHeading}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <Globe size={18} />
                    <div>
                      <span>{copy.navigation}</span>
                      <strong>{activeNavigationItems.length} active</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <MessageSquareQuote size={18} />
                    <div>
                      <span>{copy.journal}</span>
                      <strong>{getLocalizedManagedText(language, settings.journalHeadingEn, settings.journalHeadingMn)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.navigation}</h2>
                    <p>{copy.navigationSummary}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => inactiveNavigationItems[0] && openNavigationModal(inactiveNavigationItems[0])}
                    disabled={inactiveNavigationItems.length === 0}
                  >
                    <Plus size={16} />
                    {copy.add}
                  </button>
                </div>
                <div className="admin-stack">
                  {navigationPreviewItems.map((item) => {
                    const navigationLabel = getManagedNavigationLabel(item, language);
                    const hasPageBannerImage = Boolean(item.pageBannerImage.trim());

                    return (
                      <div key={item.id} className="admin-inline-card">
                        <div className="admin-inline-card-head">
                          <div className="admin-entity-head admin-navigation-entity">
                            <div className="admin-navigation-thumb">
                              {hasPageBannerImage ? (
                                <img src={item.pageBannerImage} alt={navigationLabel} />
                              ) : (
                                <span>{navigationLabel.slice(0, 1) || item.id.slice(0, 1).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="admin-navigation-copy">
                              <strong>{navigationLabel}</strong>
                              <small>{item.id}</small>
                            </div>
                            <StatusBadge
                              status={item.status}
                              activeLabel={copy.active}
                              inactiveLabel={copy.inactive}
                            />
                          </div>
                          <div className="admin-entity-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              onClick={() => openNavigationModal(item)}
                              aria-label={`${copy.edit} ${item.id}`}
                            >
                              <Pencil size={16} />
                            </button>
                            {item.status === "active" ? (
                              <button
                                type="button"
                                className="admin-icon-btn"
                                onClick={() => handleNavigationDeleteRequest(item)}
                                aria-label={`${copy.delete} ${item.id}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <small>
                          {item.group === "left" ? copy.leftGroup : copy.rightGroup}
                          {" • "}
                          {copy.sortOrder} #{item.sortOrder}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.journal}</h2>
                    <p>{copy.journalSummary}</p>
                  </div>
                  <div className="admin-topbar-actions">
                    <button type="button" className="btn btn-outline" onClick={openJournalSettingsModal}>
                      <Pencil size={16} />
                      {copy.editJournalSection}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => openJournalEntryModal()}>
                      <Plus size={16} />
                      {copy.createJournal}
                    </button>
                  </div>
                </div>
                <div className="admin-stack">
                  <div className="admin-inline-card">
                    <strong>{getLocalizedManagedText(language, settings.journalHeadingEn, settings.journalHeadingMn)}</strong>
                    <small>
                      {getLocalizedManagedText(language, settings.journalSubtextEn, settings.journalSubtextMn)}
                    </small>
                  </div>
                  {journalPreviewEntries.length === 0 ? (
                    <div className="admin-inline-card">
                      <p>{copy.journalSummary}</p>
                    </div>
                  ) : (
                    journalPreviewEntries.map((entry) => (
                      <div key={entry.id} className="admin-inline-card">
                        <div className="admin-inline-card-head">
                          <div className="admin-entity-head admin-navigation-entity">
                            <div className="admin-navigation-thumb">
                              {entry.image.trim() ? (
                                <img
                                  src={entry.image}
                                  alt={getManagedJournalTitle(entry, language) || `${copy.journal} #${entry.id}`}
                                />
                              ) : (
                                <span>
                                  {(getManagedJournalTitle(entry, language) ||
                                    getManagedJournalCategory(entry, language) ||
                                    "J"
                                  )
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="admin-navigation-copy">
                              <strong>{getManagedJournalTitle(entry, language) || `${copy.journal} #${entry.id}`}</strong>
                              <small>{getManagedJournalCategory(entry, language) || `#${entry.id}`}</small>
                            </div>
                            <StatusBadge
                              status={entry.status}
                              activeLabel={copy.active}
                              inactiveLabel={copy.inactive}
                            />
                          </div>
                          <div className="admin-entity-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              onClick={() => openJournalEntryModal(entry)}
                              aria-label={`${copy.edit} ${entry.id}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              onClick={() => handleJournalEntryDeleteRequest(entry)}
                              aria-label={`${copy.delete} ${entry.id}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        <small>
                          {formatAdminDateTime(entry.publishedAt, language)}
                          {entry.author ? ` • ${entry.author}` : ""}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.markets}</h2>
                    <p>{copy.marketSummary}</p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => openMarketModal()}>
                    <Plus size={16} />
                    {copy.createMarket}
                  </button>
                </div>
                <div className="admin-stack">
                  {markets.map((market) => (
                    <div key={market.id} className="admin-inline-card">
                      <div className="admin-inline-card-head">
                        <div className="admin-entity-head">
                          <strong>{market.name || "Market"}</strong>
                          <StatusBadge status={market.status} activeLabel={copy.active} inactiveLabel={copy.inactive} />
                        </div>
                        <div className="admin-entity-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => openMarketModal(market)}
                            aria-label={`${copy.edit} ${market.name || "market"}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button type="button" className="admin-icon-btn" onClick={() => handleMarketDeleteRequest(market)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p>{market.schedule || "-"}</p>
                      <small>{market.address || "-"}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-section-card">
                <div className="admin-section-head">
                  <div>
                    <h2>{copy.testimonials}</h2>
                    <p>{copy.testimonialSummary}</p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => openTestimonialModal()}>
                    <Plus size={16} />
                    {copy.createTestimonial}
                  </button>
                </div>
                <div className="admin-stack">
                  {testimonials.map((testimonial) => (
                    <div key={testimonial.id} className="admin-inline-card">
                      <div className="admin-inline-card-head">
                        <div className="admin-entity-head">
                          <strong>{testimonial.author || "Customer"}</strong>
                          <StatusBadge
                            status={testimonial.status}
                            activeLabel={copy.active}
                            inactiveLabel={copy.inactive}
                          />
                        </div>
                        <div className="admin-entity-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={() => openTestimonialModal(testimonial)}
                            aria-label={`${copy.edit} ${testimonial.author || "testimonial"}`}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => handleTestimonialDeleteRequest(testimonial)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <p>{testimonial.text || "-"}</p>
                      <small>{testimonial.location || "-"}</small>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : activeSection === "messages" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.messagesMenu}</p>
                  <h1>{copy.messagesTitle}</h1>
                  <p>{copy.messagesText}</p>
                </div>
              </div>

              {contactMessagesError && <div className="admin-sync-error">{contactMessagesError}</div>}

              <div className="admin-summary-grid">
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.totalMessages}</span>
                  <strong>{contactMessages.length}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.messagesLast7Days}</span>
                  <strong>{contactMessagesLast7DaysCount}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.latestReceived}</span>
                  <strong>{formatAdminDateTime(latestContactMessageAt, language)}</strong>
                </div>
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{copy.messagesMenu}</h2>
                    <p>{copy.messagesListHelp}</p>
                  </div>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table admin-messages-table">
                    <thead>
                      <tr>
                        <th>{copy.receivedAt}</th>
                        <th>{copy.senderName}</th>
                        <th>{copy.senderEmail}</th>
                        <th>{copy.messageSubject}</th>
                        <th>{copy.messageBody}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contactMessages.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="admin-table-empty">
                            {copy.emptyMessages}
                          </td>
                        </tr>
                      ) : (
                        contactMessages.map((contactMessage) => (
                          <tr key={contactMessage.id}>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{formatAdminDateTime(contactMessage.createdAt, language)}</strong>
                                <small>#{contactMessage.id.slice(0, 6).toUpperCase()}</small>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{contactMessage.name}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <a className="admin-contact-email-link" href={`mailto:${contactMessage.email}`}>
                                  {contactMessage.email}
                                </a>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary admin-table-cell-wrap">
                                <strong>{contactMessage.subject}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary admin-table-cell-wrap admin-contact-message-cell">
                                <p className="admin-contact-message-text">{contactMessage.message}</p>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : activeSection === "orders" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.orders}</p>
                  <h1>{copy.ordersTitle}</h1>
                  <p>{copy.ordersText}</p>
                </div>
              </div>

              {ordersError && <div className="admin-sync-error">{ordersError}</div>}

              <div className="admin-summary-grid">
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.totalOrders}</span>
                  <strong>{orders.length}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.paidOrders}</span>
                  <strong>{paidOrdersCount}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.deliveringOrders}</span>
                  <strong>{deliveringOrdersCount}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.deliveredOrders}</span>
                  <strong>{deliveredOrdersCount}</strong>
                </div>
                <div className="admin-summary-card admin-summary-card-compact">
                  <span>{copy.guestOrders}</span>
                  <strong>{guestOrdersCount}</strong>
                </div>
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{copy.orders}</h2>
                    <p>
                      {language === "MN"
                        ? "Захиалгын дугаар дээр дарж төлөв болон хүргэлтийн мэдээллийг засна."
                        : "Click an order number to edit the status and delivery details."}
                    </p>
                  </div>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table admin-orders-table">
                    <thead>
                      <tr>
                        <th>{language === "MN" ? "Захиалга" : "Order"}</th>
                        <th>{language === "MN" ? "Үүссэн хугацаа" : "Created"}</th>
                        <th>{copy.status}</th>
                        <th>{language === "MN" ? "Бараа" : "Items"}</th>
                        <th>{copy.paymentLabel}</th>
                        <th>{language === "MN" ? "Нийт дүн" : "Total"}</th>
                        <th>{language === "MN" ? "Эх сурвалж" : "Source"}</th>
                        <th>{language === "MN" ? "Хүлээн авагч" : "Recipient"}</th>
                        <th>{language === "MN" ? "Утас" : "Phone"}</th>
                        <th>{language === "MN" ? "Дүүрэг" : "District"}</th>
                        <th>{language === "MN" ? "Баг" : "Bag"}</th>
                        <th>{language === "MN" ? "Нэмэлт" : "Additional"}</th>
                        <th className="admin-table-sticky-action">{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="admin-table-empty">
                            {copy.emptyOrders}
                          </td>
                        </tr>
                      ) : (
                        orders.map((order) => (
                          <tr key={order.id}>
                            <td>
                              <button type="button" className="admin-table-link" onClick={() => openOrderModal(order)}>
                                <div className="admin-table-primary">
                                  <strong>{order.orderNumber}</strong>
                                  <small>{language === "MN" ? "Дарж засварлана" : "Click to edit"}</small>
                                </div>
                              </button>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{formatAdminDateTime(order.createdAt, language)}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <span className={getOrderStatusClassName(order.status)}>
                                  {getOrderStatusLabel(order.status, language)}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary admin-order-table-items admin-table-cell-wrap">
                                <div className="admin-order-table-item-names">
                                  {order.items.map((item, itemIndex) => (
                                    <span key={`${order.id}-${item.productId}-${item.variant ?? "default"}-${itemIndex}`}>
                                      {item.name}
                                      {item.variant ? ` / ${item.variant}` : ""}
                                      {` × ${item.quantity}`}
                                    </span>
                                  ))}
                                </div>
                                <small>
                                  {language === "MN"
                                    ? `Нийт ${getOrderTotalQuantity(order)} ширхэг`
                                    : `Total ${getOrderTotalQuantity(order)} pcs`}
                                </small>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{order.payment.method.toUpperCase()}</strong>
                                <small>{getOrderPaymentStatusLabel(order.payment.status, language)}</small>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{formatStorePrice(order.totals.grandTotal)}</strong>
                              </div>
                            </td>
                            <td>
                              <span className="admin-table-code">
                                {order.auth.isAnonymous
                                  ? language === "MN"
                                    ? "Зочин"
                                    : "Guest"
                                  : getAuthMethodLabel(order.auth.method as UserAuthMethod, language)}
                              </span>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{order.customer.fullName || order.customer.phoneNumber || "-"}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{order.customer.phoneNumber}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{order.address.districtOrSoum || "-"}</strong>
                                <small>{order.address.region || "-"}</small>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{order.address.khorooOrBag || "-"}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-primary admin-table-cell-wrap">
                                <strong>{order.address.streetAddress || "-"}</strong>
                                <small>
                                  {[order.address.additionalAddress, order.customer.note].filter(Boolean).join(" • ") || "-"}
                                </small>
                              </div>
                            </td>
                            <td className="admin-table-sticky-action">
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  onClick={() => openOrderModal(order)}
                                  aria-label={`${copy.edit} ${order.orderNumber}`}
                                >
                                  <Pencil size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : activeSection === "users" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{language === "MN" ? "Хэрэглэгч" : "Users"}</p>
                  <h1>{language === "MN" ? "Хэрэглэгчийн жагсаалт" : "User Directory"}</h1>
                  <p>
                    {language === "MN"
                      ? "Бүртгүүлсэн хэрэглэгчдийн role, бүртгэлийн төрөл, сүүлийн нэвтрэх аргыг эндээс харна."
                      : "Review registered users, their roles, registration types, and their latest authentication method."}
                  </p>
                </div>
              </div>

              {directoryError && <div className="admin-sync-error">{directoryError}</div>}

              <div className="admin-summary-grid">
                <div className="admin-summary-card">
                  <span>{language === "MN" ? "Нийт хэрэглэгч" : "Total users"}</span>
                  <strong>{directoryUsers.length}</strong>
                  <small>{language === "MN" ? "Бүртгэлтэй хэрэглэгчдийн тоо" : "Registered user profiles"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{getRoleLabel("sysadmin", language)}</span>
                  <strong>{userRoleCounts.sysadmin}</strong>
                  <small>{language === "MN" ? "Бүрэн эрхтэй хэрэглэгч" : "Full-access operators"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{getRoleLabel("admin", language)}</span>
                  <strong>{userRoleCounts.admin}</strong>
                  <small>{language === "MN" ? "Админ эрхтэй хэрэглэгч" : "Admin operators"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{getRoleLabel("worker", language)}</span>
                  <strong>{userRoleCounts.worker}</strong>
                  <small>{language === "MN" ? "Ажилтны эрхтэй хэрэглэгч" : "Employee accounts"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{getRoleLabel("customer", language)}</span>
                  <strong>{userRoleCounts.customer}</strong>
                  <small>{language === "MN" ? "Энгийн бүртгэлтэй хэрэглэгч" : "Standard registered users"}</small>
                </div>
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{language === "MN" ? "Хэрэглэгчид" : "Users"}</h2>
                    <p>
                      {language === "MN"
                        ? "Registration method болон last auth method-оор ялгаж харуулна."
                        : "Grouped by registration method and latest authentication method."}
                    </p>
                  </div>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>{language === "MN" ? "Хэрэглэгч" : "User"}</th>
                        <th>{language === "MN" ? "Role" : "Role"}</th>
                        <th>{language === "MN" ? "Бүртгэсэн төрөл" : "Registered Via"}</th>
                        <th>{language === "MN" ? "Сүүлийн нэвтрэлт" : "Last Auth"}</th>
                        <th>{language === "MN" ? "Холбоо барих" : "Contact"}</th>
                        <th className="admin-table-sticky-action">{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directoryUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="admin-table-empty">
                            {language === "MN" ? "Хэрэглэгч олдсонгүй." : "No user profiles found."}
                          </td>
                        </tr>
                      ) : (
                        directoryUsers.map((directoryUser) => {
                          const resolvedRole = resolveUserRole(directoryUser);

                          return (
                            <tr key={directoryUser.uid}>
                              <td>
                                <div className="admin-table-primary">
                                  <strong>{getUserIdentity(directoryUser)}</strong>
                                  <small>{directoryUser.uid}</small>
                                </div>
                              </td>
                              <td>{getRoleLabel(resolvedRole, language)}</td>
                              <td>
                                <div className="admin-table-primary">
                                  <strong>{getAuthMethodLabel(directoryUser.registrationMethod, language)}</strong>
                                  <small>
                                    {directoryUser.registrationMethod === "phone" && directoryUser.hasPassword
                                      ? language === "MN"
                                        ? "password-той phone account"
                                        : "phone account with password"
                                      : directoryUser.hasPassword
                                        ? language === "MN"
                                          ? "password идэвхтэй"
                                          : "password enabled"
                                        : language === "MN"
                                          ? "password ашиглахгүй"
                                          : "no password"}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <div className="admin-table-primary">
                                  <strong>{getAuthMethodLabel(directoryUser.lastAuthMethod, language)}</strong>
                                  <small>
                                    {directoryUser.lastSignInAt
                                      ? new Date(directoryUser.lastSignInAt).toLocaleString(language === "MN" ? "mn-MN" : "en-US")
                                      : "-"}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <div className="admin-table-primary">
                                  <strong>{directoryUser.phoneNumber ?? directoryUser.email ?? "-"}</strong>
                                  <small>{directoryUser.email ?? directoryUser.phoneLoginEmail ?? "-"}</small>
                                </div>
                              </td>
                              <td className="admin-table-sticky-action">
                                <div className="admin-table-actions">
                                  <button
                                    type="button"
                                    className="admin-icon-btn admin-icon-btn-neutral"
                                    onClick={() => openUserProfileModal(directoryUser)}
                                    title={copy.editUser}
                                    aria-label={`${copy.editUser} ${getUserIdentity(directoryUser)}`}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : activeSection === "categories" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.collections}</p>
                  <h1>{copy.categoriesTitle}</h1>
                  <p>{copy.categoriesText}</p>
                </div>
                <div className="admin-topbar-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setActiveSection("products")}>
                    <Package size={16} />
                    {copy.openProducts}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => openCollectionModal()}>
                    <Plus size={16} />
                    {copy.createCollection}
                  </button>
                </div>
              </div>

              <div className="admin-summary-grid">
                <div className="admin-summary-card">
                  <span>{copy.totalCollections}</span>
                  <strong>{collections.length}</strong>
                  <small>{copy.categorySummary}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.activeCount}</span>
                  <strong>{activeCollections.length}</strong>
                  <small>{copy.activeOnWebsite}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.inactiveCount}</span>
                  <strong>{inactiveCollectionsCount}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.linkedProducts}</span>
                  <strong>{linkedCollectionCount}</strong>
                  <small>{copy.categoryDependencyError}</small>
                </div>
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{copy.collections}</h2>
                    <p>{copy.categorySummary}</p>
                  </div>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>{copy.name}</th>
                        <th>{copy.description}</th>
                        <th>{copy.linkedProducts}</th>
                        <th>{copy.status}</th>
                        <th>{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collections.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="admin-table-empty">
                            {copy.emptyCategories}
                          </td>
                        </tr>
                      ) : (
                        collections.map((collection) => (
                          <tr key={collection.id}>
                            <td>
                              <div className="admin-table-primary-row">
                                <div className="admin-product-thumb">
                                  {getCollectionPrimaryImage(collection) ? (
                                    <img src={getCollectionPrimaryImage(collection)} alt={collection.name} />
                                  ) : (
                                    <span>{collection.name.slice(0, 1) || "C"}</span>
                                  )}
                                </div>
                                <div className="admin-table-primary">
                                  <strong>{collection.name || copy.collections}</strong>
                                  <small>
                                    #{collection.id}
                                    {isSystemCollection(collection) ? ` • ${copy.categorySystemNote}` : ""}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="admin-table-description">{collection.description || "-"}</div>
                            </td>
                            <td>{productCountByCategory.get(collection.slug) ?? 0}</td>
                            <td>
                              <StatusBadge
                                status={collection.status}
                                activeLabel={copy.active}
                                inactiveLabel={copy.inactive}
                              />
                            </td>
                            <td>
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  onClick={() => openCollectionModal(collection)}
                                  aria-label={`${copy.edit} ${collection.name}`}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="admin-icon-btn"
                                  onClick={() => handleCollectionDeleteRequest(collection)}
                                  aria-label={`${copy.delete} ${collection.name}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.products}</p>
                  <h1>{copy.productsTitle}</h1>
                  <p>{copy.productsText}</p>
                </div>
                <div className="admin-topbar-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setActiveSection("categories")}>
                    <Store size={16} />
                    {copy.openCategories}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => openProductModal()}>
                    <Plus size={16} />
                    {copy.createProduct}
                  </button>
                </div>
              </div>

              {selectableCategories.length === 0 && <div className="admin-sync-error">{copy.noCategories}</div>}

              <div className="admin-summary-grid">
                <div className="admin-summary-card">
                  <span>{copy.totalProducts}</span>
                  <strong>{products.length}</strong>
                  <small>{copy.productSummary}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.activeCount}</span>
                  <strong>{activeProducts.length}</strong>
                  <small>{copy.activeOnWebsite}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.inactiveCount}</span>
                  <strong>{inactiveProductsCount}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{copy.bestSellerCount}</span>
                  <strong>{bestSellerCount}</strong>
                  <small>{copy.bestSeller}</small>
                </div>
              </div>

              <div className="admin-data-card">
                <div className="admin-data-card-head">
                  <div>
                    <h2>{copy.products}</h2>
                    <p>{copy.productSummary}</p>
                  </div>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>{copy.name}</th>
                        <th>{copy.category}</th>
                        <th>{copy.price}</th>
                        <th>{copy.compareShort}</th>
                        <th>{copy.stockRemaining}</th>
                        <th>{copy.status}</th>
                        <th>{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="admin-table-empty">
                            {copy.emptyProducts}
                          </td>
                        </tr>
                      ) : (
                        products.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <div className="admin-table-primary-row">
                                <div className="admin-product-thumb">
                                  {getProductPrimaryImage(product) ? (
                                    <img src={getProductPrimaryImage(product)} alt={product.name} />
                                  ) : (
                                    <span>{product.name.slice(0, 1)}</span>
                                  )}
                                </div>
                                <div className="admin-table-primary">
                                  <strong>{product.name || "Product"}</strong>
                                  <small>
                                    #{product.id}
                                    {product.bestSeller ? ` • ${copy.bestSeller}` : ""}
                                  </small>
                                </div>
                              </div>
                            </td>
                            <td>{collectionNameBySlug.get(product.category) ?? product.category}</td>
                            <td>{formatStorePrice(product.price)}</td>
                            <td>{product.compareAtPrice ? formatStorePrice(product.compareAtPrice) : "-"}</td>
                            <td>
                              {(() => {
                                const stock = product.variants?.length
                                  ? product.variants.reduce((s, v) => s + (v.quantity || 0), 0)
                                  : (product.totalStock ?? 0);
                                return `${product.soldCount ?? 0}/${stock}`;
                              })()}
                            </td>
                            <td>
                              <StatusBadge
                                status={product.status}
                                activeLabel={copy.active}
                                inactiveLabel={copy.inactive}
                              />
                            </td>
                            <td>
                              <div className="admin-table-actions">
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  onClick={() => openProductModal(product)}
                                  aria-label={`${copy.edit} ${product.name}`}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="admin-icon-btn"
                                  onClick={() => handleProductDeleteRequest(product)}
                                  aria-label={`${copy.delete} ${product.name}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {settingsModal && (
        <AdminModal
          title={copy.settingsModalTitle}
          description={copy.settingsModalText}
          onClose={() => setSettingsModal(null)}
          wide
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettingsDraft(settingsModal.draft);
              setSettingsModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={settingsModal.draft.status}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: {
                        ...settingsModal.draft,
                        status: event.target.value as EntityStatus,
                      },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.brandName}</span>
                <input
                  value={settingsModal.draft.brandName}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, brandName: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.brandDescription}</span>
                <textarea
                  value={settingsModal.draft.brandDescription}
                  rows={3}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, brandDescription: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.heroHeading}</span>
                <input
                  value={settingsModal.draft.heroHeading}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, heroHeading: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.heroSubtext}</span>
                <textarea
                  value={settingsModal.draft.heroSubtext}
                  rows={2}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, heroSubtext: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.aboutTitle}</span>
                <input
                  value={settingsModal.draft.aboutIntroTitle}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, aboutIntroTitle: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.aboutBody}</span>
                <textarea
                  value={settingsModal.draft.aboutIntroBody}
                  rows={6}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, aboutIntroBody: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.contactPhone}</span>
                <input
                  value={settingsModal.draft.contactPhone}
                  onChange={(event) =>
                    setSettingsModal({
                      ...settingsModal,
                      draft: { ...settingsModal.draft, contactPhone: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.contactEmail}</span>
                <input
                  value={settingsModal.draft.contactEmail}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, contactEmail: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.location}</span>
                <input
                  value={settingsModal.draft.location}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, location: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.responseTime}</span>
                <input
                  value={settingsModal.draft.responseTime}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, responseTime: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.facebookUrl}</span>
                <input
                  value={settingsModal.draft.facebookUrl}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, facebookUrl: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.instagramHandle}</span>
                <input
                  value={settingsModal.draft.instagramHandle}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, instagramHandle: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.instagramUrl}</span>
                <input
                  value={settingsModal.draft.instagramUrl}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, instagramUrl: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.mapNote}</span>
                <textarea
                  value={settingsModal.draft.mapNote}
                  rows={3}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, mapNote: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.marketIntro}</span>
                <textarea
                  value={settingsModal.draft.marketIntro}
                  rows={3}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, marketIntro: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.storeHoursText}</span>
                <textarea
                  value={settingsModal.draft.storeHoursText}
                  rows={3}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, storeHoursText: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.wholesaleHeading}</span>
                <input
                  value={settingsModal.draft.wholesaleHeading}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, wholesaleHeading: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.wholesaleEmail}</span>
                <input
                  value={settingsModal.draft.wholesaleEmail}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, wholesaleEmail: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.wholesaleText}</span>
                <textarea
                  value={settingsModal.draft.wholesaleText}
                  rows={3}
                  onChange={(event) =>
                    setSettingsModal({
                      draft: { ...settingsModal.draft, wholesaleText: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <p className="admin-inline-note">{copy.settingsInactiveNote}</p>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setSettingsModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {navigationModal && (
        <AdminModal
          title={navigationModal.mode === "create" ? copy.navigationModalCreate : copy.navigationModalEdit}
          description={copy.navigationSummary}
          onClose={closeNavigationModal}
          disableClose={navigationBannerUploading}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (navigationBannerUploading) {
                return;
              }

              saveSettingsSection((draft) => ({
                ...draft,
                navigationItems: draft.navigationItems.map((item) =>
                  item.id === navigationModal.draft.id ? navigationModal.draft : item
                ),
              }));
              setNavigationModal(null);
              setNavigationBannerUploadError(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={navigationModal.draft.status}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: { ...navigationModal.draft, status: event.target.value as EntityStatus },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.group}</span>
                <select
                  value={navigationModal.draft.group}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: {
                        ...navigationModal.draft,
                        group: event.target.value as SiteNavigationItem["group"],
                      },
                    })
                  }
                >
                  <option value="left">{copy.leftGroup}</option>
                  <option value="right">{copy.rightGroup}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.sortOrder}</span>
                <input
                  type="number"
                  value={navigationModal.draft.sortOrder}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: { ...navigationModal.draft, sortOrder: Number(event.target.value) || 0 },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>ID</span>
                <input value={navigationModal.draft.id} disabled />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.labelMn}</span>
                <input
                  value={navigationModal.draft.labelMn}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: { ...navigationModal.draft, labelMn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.labelEn}</span>
                <input
                  value={navigationModal.draft.labelEn}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: { ...navigationModal.draft, labelEn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.pageBanner}</span>
                <input
                  type="url"
                  placeholder="https://..."
                  value={navigationModal.draft.pageBannerImage}
                  onChange={(event) =>
                    setNavigationModal({
                      ...navigationModal,
                      draft: { ...navigationModal.draft, pageBannerImage: event.target.value },
                    })
                  }
                />
                <small>{copy.pageBannerHelp}</small>
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.bannerUpload}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleNavigationBannerFileChange}
                  disabled={navigationBannerUploading}
                />
                {navigationBannerUploading && <small>{copy.bannerUploadProgress}</small>}
                {navigationBannerUploadError && (
                  <small className="admin-field-error">{navigationBannerUploadError}</small>
                )}
              </label>
              <div className="admin-field admin-field-wide">
                <span>{copy.imagePreview}</span>
                <div className="admin-collection-preview admin-banner-preview">
                  {navigationModal.draft.pageBannerImage ? (
                    <img
                      src={navigationModal.draft.pageBannerImage}
                      alt={navigationModal.draft.labelEn || navigationModal.draft.labelMn || navigationModal.draft.id}
                    />
                  ) : (
                    <div className="admin-collection-preview-empty">N</div>
                  )}
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeNavigationModal}
                disabled={navigationBannerUploading}
              >
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={navigationBannerUploading}>
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {journalSettingsModal && (
        <AdminModal
          title={copy.journalSettingsModalTitle}
          description={copy.journalSummary}
          onClose={() => setJournalSettingsModal(null)}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettingsSection((draft) => ({
                ...draft,
                journalHeadingMn: journalSettingsModal.journalHeadingMn,
                journalHeadingEn: journalSettingsModal.journalHeadingEn,
                journalSubtextMn: journalSettingsModal.journalSubtextMn,
                journalSubtextEn: journalSettingsModal.journalSubtextEn,
              }));
              setJournalSettingsModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.journalHeadingMn}</span>
                <input
                  value={journalSettingsModal.journalHeadingMn}
                  onChange={(event) =>
                    setJournalSettingsModal({
                      ...journalSettingsModal,
                      journalHeadingMn: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.journalHeadingEn}</span>
                <input
                  value={journalSettingsModal.journalHeadingEn}
                  onChange={(event) =>
                    setJournalSettingsModal({
                      ...journalSettingsModal,
                      journalHeadingEn: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.journalSubtextMn}</span>
                <textarea
                  rows={3}
                  value={journalSettingsModal.journalSubtextMn}
                  onChange={(event) =>
                    setJournalSettingsModal({
                      ...journalSettingsModal,
                      journalSubtextMn: event.target.value,
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.journalSubtextEn}</span>
                <textarea
                  rows={3}
                  value={journalSettingsModal.journalSubtextEn}
                  onChange={(event) =>
                    setJournalSettingsModal({
                      ...journalSettingsModal,
                      journalSubtextEn: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setJournalSettingsModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {journalEntryModal && (
        <AdminModal
          title={journalEntryModal.mode === "create" ? copy.journalModalCreate : copy.journalModalEdit}
          description={copy.journalSummary}
          onClose={closeJournalEntryModal}
          disableClose={journalImageUploading}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (journalImageUploading) {
                return;
              }

              saveSettingsSection((draft) => ({
                ...draft,
                journalEntries:
                  journalEntryModal.mode === "create"
                    ? [...draft.journalEntries, journalEntryModal.draft]
                    : draft.journalEntries.map((entry) =>
                        entry.id === journalEntryModal.draft.id ? journalEntryModal.draft : entry
                      ),
              }));
              setJournalEntryModal(null);
              setJournalImageUploadError(null);
              setJournalImageUploading(false);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={journalEntryModal.draft.status}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, status: event.target.value as EntityStatus },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.author}</span>
                <input
                  value={journalEntryModal.draft.author}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, author: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.publishedAt}</span>
                <input
                  type="date"
                  value={journalEntryModal.draft.publishedAt}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, publishedAt: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.journalImage}</span>
                <input
                  type="url"
                  placeholder="https://..."
                  value={journalEntryModal.draft.image}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, image: event.target.value },
                    })
                  }
                />
                <small>{copy.journalImageHelp}</small>
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.bannerUpload}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleJournalEntryFileChange}
                  disabled={journalImageUploading}
                />
                {journalImageUploading && <small>{copy.bannerUploadProgress}</small>}
                {journalImageUploadError && <small className="admin-field-error">{journalImageUploadError}</small>}
              </label>
              <div className="admin-field admin-field-wide">
                <span>{copy.imagePreview}</span>
                <div className="admin-collection-preview admin-banner-preview">
                  {journalEntryModal.draft.image ? (
                    <img
                      src={journalEntryModal.draft.image}
                      alt={getManagedJournalTitle(journalEntryModal.draft, language) || `${copy.journal} preview`}
                    />
                  ) : (
                    <div className="admin-collection-preview-empty">
                      {(getManagedJournalTitle(journalEntryModal.draft, language) ||
                        getManagedJournalCategory(journalEntryModal.draft, language) ||
                        "J"
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <label className="admin-field">
                <span>{copy.categoryMn}</span>
                <input
                  value={journalEntryModal.draft.categoryMn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, categoryMn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.categoryEn}</span>
                <input
                  value={journalEntryModal.draft.categoryEn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, categoryEn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.titleMn}</span>
                <input
                  value={journalEntryModal.draft.titleMn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, titleMn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.titleEn}</span>
                <input
                  value={journalEntryModal.draft.titleEn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, titleEn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.excerptMn}</span>
                <textarea
                  rows={3}
                  value={journalEntryModal.draft.excerptMn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, excerptMn: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.excerptEn}</span>
                <textarea
                  rows={3}
                  value={journalEntryModal.draft.excerptEn}
                  onChange={(event) =>
                    setJournalEntryModal({
                      ...journalEntryModal,
                      draft: { ...journalEntryModal.draft, excerptEn: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeJournalEntryModal}
                disabled={journalImageUploading}
              >
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={journalImageUploading}>
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {collectionModal && (
        <AdminModal
          title={collectionModal.mode === "create" ? copy.collectionModalCreate : copy.collectionModalEdit}
          description={copy.statusSummary}
          onClose={() => setCollectionModal(null)}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveCollectionDraft(collectionModal.draft);
              setCollectionModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={collectionModal.draft.status}
                  onChange={(event) =>
                    setCollectionModal({
                      ...collectionModal,
                      draft: {
                        ...collectionModal.draft,
                        status: event.target.value as EntityStatus,
                      },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.name}</span>
                <input
                  value={collectionModal.draft.name}
                  onChange={(event) =>
                    setCollectionModal({
                      ...collectionModal,
                      draft: { ...collectionModal.draft, name: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.image}</span>
                <input
                  type="url"
                  value={collectionModal.draft.image}
                  placeholder="https://..."
                  onChange={(event) =>
                    setCollectionModal({
                      ...collectionModal,
                      draft: { ...collectionModal.draft, image: event.target.value },
                    })
                  }
                />
                <small>{copy.imageHelp}</small>
              </label>
              <div className="admin-field admin-field-wide">
                <span>{copy.imagePreview}</span>
                <div className="admin-collection-preview">
                  {getCollectionPrimaryImage(collectionModal.draft) ? (
                    <img
                      src={getCollectionPrimaryImage(collectionModal.draft)}
                      alt={collectionModal.draft.name || copy.collections}
                    />
                  ) : (
                    <div className="admin-collection-preview-empty">
                      {collectionModal.draft.name.slice(0, 1) || "C"}
                    </div>
                  )}
                </div>
              </div>
              <label className="admin-field admin-field-wide">
                <span>{copy.description}</span>
                <textarea
                  rows={3}
                  value={collectionModal.draft.description}
                  onChange={(event) =>
                    setCollectionModal({
                      ...collectionModal,
                      draft: { ...collectionModal.draft, description: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <p className="admin-inline-note">
              {isSystemCollection(collectionModal.draft) ? copy.categorySystemNote : copy.categorySummary}
            </p>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setCollectionModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {heroBannerModal && (
        <AdminModal
          title={heroBannerModal.mode === "create" ? copy.bannerModalCreate : copy.bannerModalEdit}
          description={copy.bannerSummary}
          onClose={closeHeroBannerModal}
          disableClose={bannerUploading}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (bannerUploading) {
                return;
              }

              saveHeroBannerDraft(heroBannerModal.draft);
              setHeroBannerModal(null);
              setBannerUploadError(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={heroBannerModal.draft.status}
                  onChange={(event) =>
                    setHeroBannerModal({
                      ...heroBannerModal,
                      draft: {
                        ...heroBannerModal.draft,
                        status: event.target.value as EntityStatus,
                      },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.bannerCollection}</span>
                <select
                  value={heroBannerModal.draft.collectionSlug}
                  onChange={(event) =>
                    setHeroBannerModal({
                      ...heroBannerModal,
                      draft: {
                        ...heroBannerModal.draft,
                        collectionSlug: event.target.value,
                      },
                    })
                  }
                >
                  {bannerCategories.map((collection) => (
                    <option key={collection.id} value={collection.slug}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.bannerImage}</span>
                <input
                  type="url"
                  value={heroBannerModal.draft.image}
                  placeholder="https://..."
                  onChange={(event) =>
                    setHeroBannerModal({
                      ...heroBannerModal,
                      draft: {
                        ...heroBannerModal.draft,
                        image: event.target.value,
                        source: event.target.value ? "admin" : heroBannerModal.draft.source,
                      },
                    })
                  }
                />
                <small>{copy.bannerImageHelp}</small>
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.bannerUpload}</span>
                <input type="file" accept="image/*" onChange={handleHeroBannerFileChange} disabled={bannerUploading} />
                {bannerUploading && <small>{copy.bannerUploadProgress}</small>}
                {bannerUploadError && <small className="admin-field-error">{bannerUploadError}</small>}
              </label>
              <div className="admin-field admin-field-wide">
                <span>{copy.bannerAspectTitle}</span>
                <div className="admin-inline-card admin-banner-spec">
                  <div className="admin-banner-spec-visual" aria-hidden="true">
                    <span>16:9</span>
                  </div>
                  <div className="admin-banner-spec-copy">
                    <strong>{copy.bannerAspectValue}</strong>
                    <small>{copy.bannerAspectHelp}</small>
                  </div>
                </div>
              </div>
              <div className="admin-field admin-field-wide">
                <span>{copy.imagePreview}</span>
                <div className="admin-collection-preview admin-banner-preview">
                  {heroBannerModal.draft.image ? (
                    <img
                      src={heroBannerModal.draft.image}
                      alt={collectionNameBySlug.get(heroBannerModal.draft.collectionSlug) ?? copy.banners}
                    />
                  ) : (
                    <div className="admin-collection-preview-empty">B</div>
                  )}
                </div>
              </div>
            </div>
            <p className="admin-inline-note">
              {heroBannerModal.draft.source === "prairiesoapshack.com"
                ? copy.bannerImportedSource
                : copy.bannerUploadedSource}
            </p>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeHeroBannerModal}
                disabled={bannerUploading}
              >
                {copy.cancel}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={bannerCategories.length === 0 || bannerUploading}
              >
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {productModal && (
        <AdminModal
          title={productModal.mode === "create" ? copy.productModalCreate : copy.productModalEdit}
          description={copy.productSummary}
          onClose={() => setProductModal(null)}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();

              if (selectableCategories.length === 0) {
                return;
              }

              const cleanedVariants = productModal.draft.variants?.filter((v) => v.name.trim()) ?? [];
              const hasVariants = cleanedVariants.length > 0;
              const computedStock = hasVariants
                ? cleanedVariants.reduce((sum, v) => sum + (v.quantity || 0), 0)
                : (productModal.draft.totalStock ?? 0);
              saveProductDraft({
                ...productModal.draft,
                category: productModal.draft.category || selectableCategories[0].slug,
                variants: hasVariants ? cleanedVariants : undefined,
                totalStock: computedStock,
              });
              setProductModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={productModal.draft.status}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: {
                        ...productModal.draft,
                        status: event.target.value as EntityStatus,
                      },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.name}</span>
                <input
                  value={productModal.draft.name}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, name: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.category}</span>
                <select
                  value={productModal.draft.category}
                  disabled={selectableCategories.length === 0}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, category: event.target.value },
                    })
                  }
                >
                  {selectableCategories.map((collection) => (
                    <option key={collection.id} value={collection.slug}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.price}</span>
                <input
                  type="number"
                  step="0.01"
                  value={productModal.draft.price}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: {
                        ...productModal.draft,
                        price: Number(event.target.value) || 0,
                      },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.comparePrice}</span>
                <input
                  type="number"
                  step="0.01"
                  value={productModal.draft.compareAtPrice ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: {
                        ...productModal.draft,
                        compareAtPrice: event.target.value ? Number(event.target.value) : undefined,
                      },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.badge}</span>
                <input
                  value={productModal.draft.badge ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: {
                        ...productModal.draft,
                        badge: event.target.value || undefined,
                      },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-toggle">
                <span>{copy.bestSeller}</span>
                <input
                  type="checkbox"
                  checked={Boolean(productModal.draft.bestSeller)}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: {
                        ...productModal.draft,
                        bestSeller: event.target.checked,
                      },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.description}</span>
                <textarea
                  rows={5}
                  value={productModal.draft.description}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, description: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.ingredientsLabel}</span>
                <textarea
                  rows={4}
                  value={productModal.draft.ingredients ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, ingredients: event.target.value || undefined },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.usageLabel}</span>
                <textarea
                  rows={4}
                  value={productModal.draft.usage ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, usage: event.target.value || undefined },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.howToUseLabel}</span>
                <textarea
                  rows={4}
                  value={productModal.draft.howToUse ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, howToUse: event.target.value || undefined },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.cautionLabel}</span>
                <textarea
                  rows={4}
                  value={productModal.draft.caution ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, caution: event.target.value || undefined },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.shelfLifeLabel}</span>
                <input
                  value={productModal.draft.shelfLife ?? ""}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, shelfLife: event.target.value || undefined },
                    })
                  }
                />
              </label>
              {!(productModal.draft.variants?.length) && (
                <label className="admin-field admin-field-wide">
                  <span>{copy.sizeLabelField}</span>
                  <input
                    value={productModal.draft.sizeLabel ?? ""}
                    placeholder={copy.sizeLabelHelp}
                    onChange={(event) =>
                      setProductModal({
                        ...productModal,
                        draft: { ...productModal.draft, sizeLabel: event.target.value || undefined },
                      })
                    }
                  />
                </label>
              )}
              <div className="admin-field admin-field-wide">
                <span>{copy.variants}</span>
                <div className="admin-variants-list">
                  {(productModal.draft.variants ?? []).map((variant, vIndex) => (
                    <div key={vIndex} className="admin-variant-row">
                      <input
                        placeholder={copy.variantName}
                        value={variant.name}
                        onChange={(event) => {
                          const next = [...(productModal.draft.variants ?? [])];
                          next[vIndex] = { ...next[vIndex], name: event.target.value };
                          setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                        }}
                      />
                      <input
                        type="number"
                        placeholder={copy.variantPrice}
                        value={variant.price || ""}
                        onChange={(event) => {
                          const next = [...(productModal.draft.variants ?? [])];
                          next[vIndex] = { ...next[vIndex], price: Number(event.target.value) || 0 };
                          setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                        }}
                      />
                      <input
                        type="number"
                        placeholder={copy.variantQuantity}
                        value={variant.quantity || ""}
                        onChange={(event) => {
                          const next = [...(productModal.draft.variants ?? [])];
                          next[vIndex] = { ...next[vIndex], quantity: Number(event.target.value) || 0 };
                          setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                        }}
                      />
                      {(variant.soldCount ?? 0) > 0 && (
                        <span className="admin-variant-sold">
                          {language === "MN"
                            ? `${variant.soldCount} зарагдсан · ${variant.quantity - (variant.soldCount ?? 0)} үлдсэн`
                            : `${variant.soldCount} sold · ${variant.quantity - (variant.soldCount ?? 0)} left`}
                        </span>
                      )}
                      <button
                        type="button"
                        className="admin-icon-btn"
                        onClick={() => {
                          const next = (productModal.draft.variants ?? []).filter((_, i) => i !== vIndex);
                          setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next.length > 0 ? next : undefined } });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      const next = [...(productModal.draft.variants ?? []), { name: "", price: 0, quantity: 0 }];
                      setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                    }}
                  >
                    <Plus size={14} /> {copy.addVariant}
                  </button>
                </div>
              </div>
              {(() => {
                const hasVariants = (productModal.draft.variants ?? []).length > 0;
                const variantTotal = hasVariants
                  ? (productModal.draft.variants ?? []).reduce((sum, v) => sum + (v.quantity || 0), 0)
                  : 0;
                const currentStock = hasVariants ? variantTotal : (productModal.draft.totalStock ?? 0);
                const sold = productModal.draft.soldCount ?? 0;
                return (
                  <div className="admin-field admin-field-wide">
                    <span>{copy.totalStock} / {copy.soldCount}</span>
                    <div className="admin-stock-row">
                      {hasVariants ? (
                        <div className="admin-stock-remaining">
                          <small>{copy.totalStock}</small>
                          <strong>{variantTotal}</strong>
                        </div>
                      ) : (
                        <label className="admin-field">
                          <small>{copy.totalStock}</small>
                          <input
                            type="number"
                            value={productModal.draft.totalStock ?? 0}
                            onChange={(event) =>
                              setProductModal({
                                ...productModal,
                                draft: { ...productModal.draft, totalStock: Number(event.target.value) || 0 },
                              })
                            }
                          />
                        </label>
                      )}
                      <label className="admin-field">
                        <small>{copy.soldCount}</small>
                        <input
                          type="number"
                          value={sold}
                          onChange={(event) =>
                            setProductModal({
                              ...productModal,
                              draft: { ...productModal.draft, soldCount: Number(event.target.value) || 0 },
                            })
                          }
                        />
                      </label>
                      <div className="admin-stock-remaining">
                        <small>{copy.stockRemaining}</small>
                        <strong>{currentStock - sold}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="admin-field admin-field-wide">
                <span>{copy.productImages}</span>
                <small>{copy.productImagesHelp}</small>
                <div className="admin-product-images">
                  {productModal.draft.images.map((image, index) =>
                    image ? (
                      <div key={index} className="admin-product-image-item">
                        <img src={image} alt={`Product ${index + 1}`} className="admin-product-image-preview" />
                        <button type="button" className="admin-product-image-remove" onClick={() => removeProductImage(index)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null
                  )}
                  {productModal.draft.images.filter(Boolean).length < 3 && (
                    <label className="admin-product-image-add">
                      <Plus size={20} />
                      <span>{copy.addImage}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const nextIndex = productModal.draft.images.filter(Boolean).length;
                          handleProductImageUpload(event, nextIndex);
                        }}
                        disabled={productImageUploading}
                        style={{ display: "none" }}
                      />
                    </label>
                  )}
                </div>
                {productImageUploading && <small>{copy.bannerUploadProgress}</small>}
                {productImageUploadError && <small className="admin-field-error">{productImageUploadError}</small>}
              </div>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setProductModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={selectableCategories.length === 0}>
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {marketModal && (
        <AdminModal
          title={marketModal.mode === "create" ? copy.marketModalCreate : copy.marketModalEdit}
          description={copy.marketSummary}
          onClose={() => setMarketModal(null)}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveMarketDraft(marketModal.draft);
              setMarketModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={marketModal.draft.status}
                  onChange={(event) =>
                    setMarketModal({
                      ...marketModal,
                      draft: { ...marketModal.draft, status: event.target.value as EntityStatus },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.name}</span>
                <input
                  value={marketModal.draft.name}
                  onChange={(event) =>
                    setMarketModal({
                      ...marketModal,
                      draft: { ...marketModal.draft, name: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.schedule}</span>
                <input
                  value={marketModal.draft.schedule}
                  onChange={(event) =>
                    setMarketModal({
                      ...marketModal,
                      draft: { ...marketModal.draft, schedule: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.season}</span>
                <input
                  value={marketModal.draft.season}
                  onChange={(event) =>
                    setMarketModal({
                      ...marketModal,
                      draft: { ...marketModal.draft, season: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.address}</span>
                <textarea
                  rows={3}
                  value={marketModal.draft.address}
                  onChange={(event) =>
                    setMarketModal({
                      ...marketModal,
                      draft: { ...marketModal.draft, address: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setMarketModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {testimonialModal && (
        <AdminModal
          title={testimonialModal.mode === "create" ? copy.testimonialModalCreate : copy.testimonialModalEdit}
          description={copy.testimonialSummary}
          onClose={() => setTestimonialModal(null)}
        >
          <form
            className="admin-modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveTestimonialDraft(testimonialModal.draft);
              setTestimonialModal(null);
            }}
          >
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select
                  value={testimonialModal.draft.status}
                  onChange={(event) =>
                    setTestimonialModal({
                      ...testimonialModal,
                      draft: { ...testimonialModal.draft, status: event.target.value as EntityStatus },
                    })
                  }
                >
                  <option value="active">{copy.active}</option>
                  <option value="inactive">{copy.inactive}</option>
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.author}</span>
                <input
                  value={testimonialModal.draft.author}
                  onChange={(event) =>
                    setTestimonialModal({
                      ...testimonialModal,
                      draft: { ...testimonialModal.draft, author: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.location}</span>
                <input
                  value={testimonialModal.draft.location}
                  onChange={(event) =>
                    setTestimonialModal({
                      ...testimonialModal,
                      draft: { ...testimonialModal.draft, location: event.target.value },
                    })
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.quote}</span>
                <textarea
                  rows={5}
                  value={testimonialModal.draft.text}
                  onChange={(event) =>
                    setTestimonialModal({
                      ...testimonialModal,
                      draft: { ...testimonialModal.draft, text: event.target.value },
                    })
                  }
                />
              </label>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setTestimonialModal(null)}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {confirmModal && (
        <AdminModal title={confirmModal.title} onClose={() => setConfirmModal(null)}>
          <div className="admin-confirm-body">
            <p>{confirmModal.description}</p>
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setConfirmModal(null)}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className={confirmModal.destructive ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {userProfileModal && (
        <AdminModal
          title={copy.userModalTitle}
          description={copy.userModalDescription}
          onClose={closeUserProfileModal}
          disableClose={savingUserProfile}
        >
          <form className="admin-modal-form" onSubmit={handleUserProfileSubmit}>
            {userProfileError && <div className="admin-sync-error">{userProfileError}</div>}

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.displayName}</span>
                <input
                  value={userProfileModal.draft.displayName ?? ""}
                  onChange={(event) =>
                    setUserProfileModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              displayName: event.target.value,
                            },
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.userRole}</span>
                <select
                  value={userProfileModal.draft.role}
                  onChange={(event) =>
                    setUserProfileModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              role: event.target.value as UserRole,
                            },
                          }
                        : current
                    )
                  }
                >
                  {getManageableRoleOptions(userProfileModal.draft.role).map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {getRoleLabel(roleOption, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>{copy.senderEmail}</span>
                <input
                  type="email"
                  value={userProfileModal.draft.email ?? ""}
                  onChange={(event) =>
                    setUserProfileModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              email: event.target.value,
                            },
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="admin-field">
                <span>{copy.contactPhone}</span>
                <input
                  type="tel"
                  value={userProfileModal.draft.phoneNumber ?? ""}
                  onChange={(event) =>
                    setUserProfileModal((current) =>
                      current
                        ? {
                            ...current,
                            draft: {
                              ...current.draft,
                              phoneNumber: event.target.value,
                            },
                          }
                        : current
                    )
                  }
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{copy.userUid}</span>
                <input value={userProfileModal.draft.uid} disabled />
              </label>
            </div>

            <div className="admin-inline-card">
              <div className="admin-inline-card-head">
                <strong>{language === "MN" ? "Нэвтрэлтийн мэдээлэл" : "Authentication details"}</strong>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>{copy.registeredVia}</span>
                  <input value={getAuthMethodLabel(userProfileModal.draft.registrationMethod, language)} disabled />
                </label>
                <label className="admin-field">
                  <span>{copy.lastAuth}</span>
                  <input value={getAuthMethodLabel(userProfileModal.draft.lastAuthMethod, language)} disabled />
                </label>
                <label className="admin-field">
                  <span>{copy.registeredAt}</span>
                  <input value={formatAdminDateTime(userProfileModal.draft.registeredAt, language)} disabled />
                </label>
                <label className="admin-field">
                  <span>{language === "MN" ? "Сүүлд нэвтэрсэн огноо" : "Last sign-in at"}</span>
                  <input value={formatAdminDateTime(userProfileModal.draft.lastSignInAt, language)} disabled />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{copy.userProviders}</span>
                  <input value={getUserProviderSummary(userProfileModal.draft)} disabled />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{copy.phoneLoginEmail}</span>
                  <input value={userProfileModal.draft.phoneLoginEmail ?? "-"} disabled />
                </label>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeUserProfileModal} disabled={savingUserProfile}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingUserProfile}>
                {savingUserProfile ? "..." : copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {orderModal && (
        <AdminModal
          title={copy.orderDetailsTitle}
          description={`${copy.orderDetailsText} (${orderModal.draft.orderNumber})`}
          onClose={closeOrderModal}
          wide
          disableClose={savingOrderModal}
        >
          <form className="admin-modal-form" onSubmit={handleOrderModalSubmit}>
            {orderModalError && <div className="admin-sync-error">{orderModalError}</div>}

            <div className="admin-order-meta-grid">
              <div className="admin-order-meta-card">
                <span>{language === "MN" ? "Захиалгын дугаар" : "Order number"}</span>
                <strong>{orderModal.draft.orderNumber}</strong>
                <small>{formatAdminDateTime(orderModal.draft.createdAt, language)}</small>
              </div>
              <div className="admin-order-meta-card">
                <span>{copy.paymentLabel}</span>
                <strong>{formatStorePrice(orderModal.draft.totals.grandTotal)}</strong>
                <small>
                  {orderModal.draft.status === "new"
                    ? language === "MN"
                      ? "Төлбөр хүлээгдэж байна"
                      : "Payment pending"
                    : `${copy.paidAtLabel}: ${formatAdminDateTime(orderModal.draft.payment.paidAt, language)}`}
                </small>
              </div>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{copy.status}</span>
                <select value={orderModal.draft.status} onChange={handleOrderStatusChange}>
                  {orderStatusOptions.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
                <small>{copy.orderStatusHelp}</small>
              </label>

              <div className="admin-field">
                <span>{copy.orderPaymentLabel}</span>
                <div className="admin-order-static-value">
                  <strong>
                    {orderModal.draft.status === "new"
                      ? language === "MN"
                        ? "Төлбөр хүлээгдэж байна"
                        : "Payment pending"
                      : language === "MN"
                        ? "Төлбөр төлөгдсөн"
                        : "Payment paid"}
                  </strong>
                  <small>{copy.paymentStateLabel}</small>
                </div>
              </div>
            </div>

            <div className="admin-inline-card">
              <div className="admin-inline-card-head">
                <strong>{copy.customerInfo}</strong>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>{language === "MN" ? "Хүлээн авагчийн нэр" : "Recipient name"}</span>
                  <input
                    type="text"
                    value={orderModal.draft.customer.fullName}
                    onChange={handleOrderCustomerChange("fullName")}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>{language === "MN" ? "Утасны дугаар" : "Phone number"}</span>
                  <input
                    type="tel"
                    value={orderModal.draft.customer.phoneNumber}
                    onChange={handleOrderCustomerChange("phoneNumber")}
                    required
                  />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{copy.note}</span>
                  <textarea value={orderModal.draft.customer.note} onChange={handleOrderCustomerChange("note")} rows={3} />
                </label>
              </div>
            </div>

            <div className="admin-inline-card">
              <div className="admin-inline-card-head">
                <strong>{copy.addressInfo}</strong>
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>{language === "MN" ? "Аймаг / Хот" : "Province / City"}</span>
                  <input type="text" value={orderModal.draft.address.region} onChange={handleOrderAddressChange("region")} required />
                </label>
                <label className="admin-field">
                  <span>{language === "MN" ? "Дүүрэг / Сум" : "District / Soum"}</span>
                  <input
                    type="text"
                    value={orderModal.draft.address.districtOrSoum}
                    onChange={handleOrderAddressChange("districtOrSoum")}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>{language === "MN" ? "Хороо / Баг" : "Khoroo / Bag"}</span>
                  <input
                    type="text"
                    value={orderModal.draft.address.khorooOrBag}
                    onChange={handleOrderAddressChange("khorooOrBag")}
                    required
                  />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{language === "MN" ? "Байр, орц, давхар, тоот" : "Street address"}</span>
                  <input
                    type="text"
                    value={orderModal.draft.address.streetAddress}
                    onChange={handleOrderAddressChange("streetAddress")}
                    required
                  />
                </label>
                <label className="admin-field admin-field-wide">
                  <span>{language === "MN" ? "Нэмэлт хаяг" : "Additional address"}</span>
                  <input
                    type="text"
                    value={orderModal.draft.address.additionalAddress}
                    onChange={handleOrderAddressChange("additionalAddress")}
                  />
                </label>
              </div>
            </div>

            <div className="admin-inline-card">
              <div className="admin-inline-card-head">
                <strong>{copy.orderItemsLabel}</strong>
                <small className="admin-inline-note">{copy.orderReadonlyItemsNote}</small>
              </div>
              <div className="admin-order-items-summary">
                <span>
                  {language === "MN"
                    ? `${orderModal.draft.items.length} төрөл`
                    : `${orderModal.draft.items.length} item types`}
                </span>
                <strong>
                  {language === "MN"
                    ? `Нийт ${getOrderTotalQuantity(orderModal.draft)} ширхэг`
                    : `Total ${getOrderTotalQuantity(orderModal.draft)} pcs`}
                </strong>
              </div>
              <div className="admin-order-items">
                {orderModal.draft.items.map((item, itemIndex) => (
                  <div key={`${item.productId}-${item.variant ?? "default"}-${itemIndex}`} className="admin-order-item">
                    <div className="admin-order-item-main">
                      <div className="admin-order-item-thumb">
                        {item.image ? (
                          <img src={item.image} alt={item.name} />
                        ) : (
                          <span>{item.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="admin-order-item-copy">
                        <strong>{item.name}</strong>
                        <div className="admin-order-item-meta">
                          <span>{item.variant || (language === "MN" ? "Сонголтгүй" : "No variant")}</span>
                          <span>{item.category}</span>
                        </div>
                      </div>
                    </div>
                    <div className="admin-order-item-stats">
                      <div>
                        <span>{language === "MN" ? "Тоо" : "Qty"}</span>
                        <strong>{item.quantity}</strong>
                      </div>
                      <div>
                        <span>{language === "MN" ? "Нэгж үнэ" : "Unit price"}</span>
                        <strong>{formatStorePrice(item.unitPrice)}</strong>
                      </div>
                      <div>
                        <span>{language === "MN" ? "Нийлбэр" : "Line total"}</span>
                        <strong>{formatStorePrice(item.lineTotal)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="admin-order-totals">
                <div className="admin-order-totals-row">
                  <span>{language === "MN" ? "Барааны дүн" : "Subtotal"}</span>
                  <span>{formatStorePrice(orderModal.draft.totals.subtotal)}</span>
                </div>
                <div className="admin-order-totals-row">
                  <span>{language === "MN" ? "Хүргэлтийн үнэ" : "Shipping fee"}</span>
                  <span>{formatStorePrice(orderModal.draft.totals.shippingFee)}</span>
                </div>
                <div className="admin-order-totals-row admin-order-totals-grand">
                  <span>{language === "MN" ? "Нийт дүн" : "Grand total"}</span>
                  <strong>{formatStorePrice(orderModal.draft.totals.grandTotal)}</strong>
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeOrderModal} disabled={savingOrderModal}>
                {copy.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingOrderModal}>
                {savingOrderModal ? "..." : copy.save}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}
