import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  Images,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquareQuote,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Store,
  Trash2,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStorefront } from "../context/StorefrontContext";
import { useLanguage } from "../context/LanguageContext";
import type { Collection, EntityStatus, Product } from "../data/products";
import type { HeroBanner, MarketItem, ShopSettings, Testimonial } from "../data/storefront";
import {
  resolveUserRole,
  subscribeToUserProfiles,
  type UserAuthMethod,
  type UserProfile,
  type UserRole,
} from "../lib/userProfiles";
import {
  DEFAULT_COLLECTION_GRADIENT,
  getActiveHeroBanners,
  formatStorePrice,
  getActiveCollections,
  getActiveMarkets,
  getActiveProducts,
  getActiveTestimonials,
  getCollectionPrimaryImage,
  getProductPrimaryImage,
  getRenderableSettings,
  isSystemCollection,
} from "../lib/storefrontHelpers";
import { uploadStorefrontImage } from "../lib/storageUpload";
import "./Auth.css";

type AdminSection = "dashboard" | "website" | "categories" | "products" | "users";
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
  variantsText: string;
}

interface HeroBannerModalState {
  mode: ModalMode;
  draft: HeroBanner;
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

function formatVariants(variants?: Product["variants"]) {
  return variants?.map((variant) => `${variant.name}|${variant.price}`).join("\n") ?? "";
}

function parseVariants(value: string): Product["variants"] | undefined {
  const rows = value
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

  const variants = rows
    .map((row) => {
      const [name, price] = row.split("|").map((part) => part.trim());
      const parsedPrice = Number(price);

      if (!name || !Number.isFinite(parsedPrice)) {
        return null;
      }

      return { name, price: parsedPrice };
    })
    .filter((variant): variant is NonNullable<typeof variant> => variant !== null);

  return variants.length > 0 ? variants : undefined;
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    images: [...product.images],
    variants: product.variants?.map((variant) => ({ ...variant })),
  };
}

function getUserIdentity(profile: UserProfile) {
  return profile.displayName || profile.email || profile.phoneNumber || profile.uid;
}

function getRoleLabel(role: UserRole, language: "MN" | "EN") {
  switch (role) {
    case "sysadmin":
      return "sysadmin";
    case "admin":
      return "admin";
    default:
      return language === "MN" ? "хэрэглэгч" : "customer";
  }
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
    saveHeroBannerDraft,
    deleteHeroBanner,
    saveMarketDraft,
    deleteMarket,
    saveTestimonialDraft,
    deleteTestimonial,
    resetStorefront,
  } = useStorefront();

  const copy =
    language === "MN"
      ? {
          dashboard: "Dashboard",
          website: "Website",
          categoriesMenu: "Ангилал",
          productsMenu: "Бүтээгдэхүүн",
          dashboardTitle: "Админ хянах самбар",
          dashboardText: "Website, Ангилал, Бүтээгдэхүүн хэсгүүдийг modal-based workflow-оор удирдана.",
          websiteTitle: "Вэб контент",
          websiteText: "Storefront settings, market, testimonial мэдээллүүд энэ хэсгээс modal-аар засагдана.",
          categoriesTitle: "Ангиллын удирдлага",
          categoriesText: "Ангилал нэмэх, засах, идэвхжүүлэх, идэвхгүй болгох бүх үйлдэл modal-оор хийгдэнэ.",
          productsTitle: "Бүтээгдэхүүний удирдлага",
          productsText: "Бүх бүтээгдэхүүний статус, үнэ, ангилал, тайлбар, variant-ийг modal-аар удирдана.",
          products: "Бүтээгдэхүүн",
          collections: "Ангилал",
          banners: "Баннер",
          markets: "Markets",
          testimonials: "Testimonials",
          settings: "Website Settings",
          totalProducts: "Бүтээгдэхүүн",
          totalCollections: "Ангилал",
          totalBanners: "Баннер",
          totalMarkets: "Markets",
          totalTestimonials: "Testimonials",
          activeCount: "Active",
          inactiveCount: "Inactive",
          actions: "Action",
          linkedProducts: "Хамааралтай бүтээгдэхүүн",
          bestSellerCount: "Best seller",
          compareShort: "Compare",
          image: "Зураг",
          emptyCategories: "Ангилал байхгүй байна.",
          emptyProducts: "Бүтээгдэхүүн байхгүй байна.",
          openWebsite: "Website",
          openCategories: "Ангилал",
          openProducts: "Бүтээгдэхүүн",
          signedIn: "Нэвтэрсэн хэрэглэгч",
          status: "Status",
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
          imageHelp: "Category card болон home section дээр харагдах зургийн URL оруулна.",
          imagePreview: "Зургийн preview",
          variantsHelp: "Нэг мөрөнд `Нэр|Үнэ` форматаар оруулна.",
          description: "Тайлбар",
          price: "Үнэ",
          name: "Нэр",
          category: "Ангилал",
          brandName: "Brand нэр",
          brandDescription: "Brand description",
          heroHeading: "Hero heading",
          heroSubtext: "Hero subtext",
          aboutTitle: "About title",
          aboutBody: "About body",
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
          schedule: "Хуваарь",
          address: "Хаяг",
          season: "Улирал",
          quote: "Сэтгэгдэл",
          author: "Зохиогч",
          bannerCollection: "Ангилал",
          bannerImage: "Баннер зураг",
          bannerUpload: "Зураг upload",
          bannerUploadProgress: "Зураг upload хийж байна...",
          bannerUploadFailed: "Зураг upload амжилтгүй боллоо.",
          bannerSummary: "Home hero slideshow дээрх баннерууд.",
          bannerModalCreate: "Баннер нэмэх",
          bannerModalEdit: "Баннер засах",
          deleteBannerDescription: "Энэ баннерыг устгах уу?",
          bannerDependencyError: "Энэ ангилал баннер дээр ашиглагдаж байгаа тул устгах боломжгүй.",
          bannerImageHelp: "URL оруулах эсвэл шууд файл upload хийж болно.",
          bannerAspectTitle: "Зөвлөмжит зургийн стандарт",
          bannerAspectValue: "16:9 харьцаа",
          bannerAspectHelp: "Хамгийн багадаа 1600 x 900, боломжтой бол 1920 x 1080 зураг ашиглаарай.",
          bannerImportedSource: "Эх сурвалж: Prairie Soap Shack",
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
          dashboardTitle: "Admin dashboard",
          dashboardText: "Manage Website, Categories, and Products through modal-based workflows.",
          websiteTitle: "Website content",
          websiteText: "Storefront settings, markets, and testimonials are managed from this section.",
          categoriesTitle: "Category management",
          categoriesText: "Create, edit, activate, or deactivate categories through modal forms.",
          productsTitle: "Product management",
          productsText: "Manage product status, pricing, category, descriptions, and variants in modal forms.",
          products: "Products",
          collections: "Categories",
          banners: "Banners",
          markets: "Markets",
          testimonials: "Testimonials",
          settings: "Website Settings",
          totalProducts: "Products",
          totalCollections: "Categories",
          totalBanners: "Banners",
          totalMarkets: "Markets",
          totalTestimonials: "Testimonials",
          activeCount: "Active",
          inactiveCount: "Inactive",
          actions: "Action",
          linkedProducts: "Linked products",
          bestSellerCount: "Best sellers",
          compareShort: "Compare",
          image: "Image",
          emptyCategories: "No categories found.",
          emptyProducts: "No products found.",
          openWebsite: "Website",
          openCategories: "Categories",
          openProducts: "Products",
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
          imageHelp: "Paste the image URL used on category cards and home sections.",
          imagePreview: "Image preview",
          variantsHelp: "Enter one variant per line using `Name|Price`.",
          description: "Description",
          price: "Price",
          name: "Name",
          category: "Category",
          brandName: "Brand name",
          brandDescription: "Brand description",
          heroHeading: "Hero heading",
          heroSubtext: "Hero subtext",
          aboutTitle: "About title",
          aboutBody: "About body",
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
          schedule: "Schedule",
          address: "Address",
          season: "Season",
          quote: "Quote",
          author: "Author",
          bannerCollection: "Categories",
          bannerImage: "Banner image",
          bannerUpload: "Upload image",
          bannerUploadProgress: "Uploading image...",
          bannerUploadFailed: "Image upload failed.",
          bannerSummary: "Displayed inside the homepage hero slideshow.",
          bannerModalCreate: "Create banner",
          bannerModalEdit: "Edit banner",
          deleteBannerDescription: "Delete this banner?",
          bannerDependencyError: "This category is used by hero banners and cannot be deleted.",
          bannerImageHelp: "Paste an image URL or upload a file directly.",
          bannerAspectTitle: "Recommended image format",
          bannerAspectValue: "16:9 aspect ratio",
          bannerAspectHelp: "Use at least 1600 x 900, ideally 1920 x 1080 for the homepage hero.",
          bannerImportedSource: "Source: Prairie Soap Shack",
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
  const [heroBannerModal, setHeroBannerModal] = useState<HeroBannerModalState | null>(null);
  const [marketModal, setMarketModal] = useState<MarketModalState | null>(null);
  const [testimonialModal, setTestimonialModal] = useState<TestimonialModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const visibleSettings = useMemo(() => getRenderableSettings(settings), [settings]);
  const activeCollections = useMemo(() => getActiveCollections(collections), [collections]);
  const activeProducts = useMemo(() => getActiveProducts(products, collections), [products, collections]);
  const activeHeroBanners = useMemo(() => getActiveHeroBanners(heroBanners, collections), [heroBanners, collections]);
  const activeMarkets = useMemo(() => getActiveMarkets(markets), [markets]);
  const activeTestimonials = useMemo(() => getActiveTestimonials(testimonials), [testimonials]);
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
    () => ({
      sysadmin: directoryUsers.filter((item) => resolveUserRole(item) === "sysadmin").length,
      admin: directoryUsers.filter((item) => resolveUserRole(item) === "admin").length,
      customer: directoryUsers.filter((item) => resolveUserRole(item) === "customer").length,
    }),
    [directoryUsers]
  );

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
    if (!isPrivilegedUser && activeSection === "users") {
      setActiveSection("dashboard");
    }
  }, [activeSection, isPrivilegedUser]);

  const openSettingsModal = () => {
    setSettingsModal({ draft: { ...settings } });
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
        },
        variantsText: formatVariants(product.variants),
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
      variantsText: "",
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

  const handleResetStorefront = () => {
    openConfirmModal({
      title: copy.resetConfirmTitle,
      description: copy.resetConfirmDescription,
      confirmLabel: copy.reset,
      destructive: true,
      onConfirm: () => resetStorefront(),
    });
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

  return (
    <div className="admin-page">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">
            <span className="admin-brand-mark">Savana</span>
            <strong>{visibleSettings.brandName}</strong>
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

          <nav className="admin-nav">
            <button
              type="button"
              className={`admin-nav-btn ${activeSection === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveSection("dashboard")}
            >
              <LayoutDashboard size={18} />
              {copy.dashboard}
            </button>
            <button
              type="button"
              className={`admin-nav-btn ${activeSection === "website" ? "active" : ""}`}
              onClick={() => setActiveSection("website")}
            >
              <Globe size={18} />
              {copy.website}
            </button>
            <button
              type="button"
              className={`admin-nav-btn ${activeSection === "categories" ? "active" : ""}`}
              onClick={() => setActiveSection("categories")}
            >
              <Store size={18} />
              {copy.categoriesMenu}
            </button>
            <button
              type="button"
              className={`admin-nav-btn ${activeSection === "products" ? "active" : ""}`}
              onClick={() => setActiveSection("products")}
            >
              <Package size={18} />
              {copy.productsMenu}
            </button>
            {isPrivilegedUser && (
              <button
                type="button"
                className={`admin-nav-btn ${activeSection === "users" ? "active" : ""}`}
                onClick={() => setActiveSection("users")}
              >
                <Users size={18} />
                {language === "MN" ? "Хэрэглэгч" : "Users"}
              </button>
            )}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-user-card">
              <div className="admin-user-head">
                <UserCircle2 size={28} />
                <div>
                  <span>{copy.signedIn}</span>
                  <strong>{user?.phoneNumber ?? user?.email ?? user?.displayName ?? user?.uid}</strong>
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

            <button type="button" className="btn btn-outline admin-logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              {loggingOut ? "..." : copy.logout}
            </button>
          </div>
        </aside>

        <section className="admin-content">
          {activeSection === "dashboard" ? (
            <>
              <div className="admin-topbar">
                <div>
                  <p className="admin-kicker">{copy.quickOverview}</p>
                  <h1>{copy.dashboardTitle}</h1>
                  <p>{copy.dashboardText}</p>
                </div>
                <div className="admin-topbar-actions">
                  <button type="button" className="btn btn-outline" onClick={() => setActiveSection("website")}>
                    <Globe size={16} />
                    {copy.openWebsite}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setActiveSection("categories")}>
                    <Store size={16} />
                    {copy.openCategories}
                  </button>
                  {isPrivilegedUser && (
                    <button type="button" className="btn btn-outline" onClick={() => setActiveSection("users")}>
                      <Users size={16} />
                      {language === "MN" ? "Хэрэглэгч" : "Users"}
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => setActiveSection("products")}>
                    <Package size={16} />
                    {copy.openProducts}
                  </button>
                </div>
              </div>

              <div className="admin-stat-grid">
                <div className="admin-stat-card">
                  <span>{copy.totalProducts}</span>
                  <strong>{activeProducts.length}/{products.length}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-stat-card">
                  <span>{copy.totalCollections}</span>
                  <strong>{activeCollections.length}/{collections.length}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-stat-card">
                  <span>{copy.totalBanners}</span>
                  <strong>{activeHeroBanners.length}/{heroBanners.length}</strong>
                  <small>{copy.bannerSummary}</small>
                </div>
                <div className="admin-stat-card">
                  <span>{copy.totalMarkets}</span>
                  <strong>{activeMarkets.length}/{markets.length}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-stat-card">
                  <span>{copy.totalTestimonials}</span>
                  <strong>{activeTestimonials.length}/{testimonials.length}</strong>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-stat-card">
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
                </div>
                <div className="admin-stat-card">
                  <span>{copy.firestoreStructure}</span>
                  <strong>{backend}</strong>
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
                  <code>{structure.heroBanners}</code>
                  <code>{structure.markets}</code>
                  <code>{structure.testimonials}</code>
                </div>
                {error && <div className="admin-sync-error">{error}</div>}
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
                  <button type="button" className="btn btn-outline" onClick={handleResetStorefront}>
                    <RotateCcw size={16} />
                    {copy.reset}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={openSettingsModal}>
                    <Pencil size={16} />
                    {copy.editWebsite}
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
                    <strong>{copy.banners}</strong>
                    <span>{activeHeroBanners.length}/{heroBanners.length}</span>
                  </div>
                  <p>{copy.bannerSummary}</p>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.markets}</strong>
                    <span>{activeMarkets.length}/{markets.length}</span>
                  </div>
                  <p>{copy.marketSummary}</p>
                  <small>{copy.statusSummary}</small>
                </div>
                <div className="admin-summary-card">
                  <div className="admin-inline-card-head">
                    <strong>{copy.testimonials}</strong>
                    <span>{activeTestimonials.length}/{testimonials.length}</span>
                  </div>
                  <p>{copy.testimonialSummary}</p>
                  <small>{copy.statusSummary}</small>
                </div>
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
                                  className="btn btn-outline admin-table-action"
                                  onClick={() => openHeroBannerModal(heroBanner)}
                                >
                                  <Pencil size={15} />
                                  {copy.edit}
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
                  <button type="button" className="btn btn-outline" onClick={openSettingsModal}>
                    <Pencil size={16} />
                    {copy.edit}
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
                    <MapPin size={18} />
                    <div>
                      <span>{copy.contactEmail}</span>
                      <strong>{settings.contactEmail}</strong>
                    </div>
                  </div>
                  <div className="admin-preview-item">
                    <MessageSquareQuote size={18} />
                    <div>
                      <span>{copy.wholesaleHeading}</span>
                      <strong>{settings.wholesaleHeading}</strong>
                    </div>
                  </div>
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
                          <button type="button" className="btn btn-outline" onClick={() => openMarketModal(market)}>
                            <Pencil size={16} />
                            {copy.edit}
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
                          <button type="button" className="btn btn-outline" onClick={() => openTestimonialModal(testimonial)}>
                            <Pencil size={16} />
                            {copy.edit}
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
                  <span>sysadmin</span>
                  <strong>{userRoleCounts.sysadmin}</strong>
                  <small>{language === "MN" ? "Бүрэн эрхтэй хэрэглэгч" : "Full-access operators"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>admin</span>
                  <strong>{userRoleCounts.admin}</strong>
                  <small>{language === "MN" ? "Админ эрхтэй хэрэглэгч" : "Admin operators"}</small>
                </div>
                <div className="admin-summary-card">
                  <span>{language === "MN" ? "Хэрэглэгч" : "Customers"}</span>
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
                      </tr>
                    </thead>
                    <tbody>
                      {directoryUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="admin-table-empty">
                            {language === "MN" ? "Хэрэглэгч олдсонгүй." : "No user profiles found."}
                          </td>
                        </tr>
                      ) : (
                        directoryUsers.map((directoryUser) => (
                          <tr key={directoryUser.uid}>
                            <td>
                              <div className="admin-table-primary">
                                <strong>{getUserIdentity(directoryUser)}</strong>
                                <small>{directoryUser.uid}</small>
                              </div>
                            </td>
                            <td>{getRoleLabel(resolveUserRole(directoryUser), language)}</td>
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
                          </tr>
                        ))
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
                                  className="btn btn-outline admin-table-action"
                                  onClick={() => openCollectionModal(collection)}
                                >
                                  <Pencil size={15} />
                                  {copy.edit}
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
                        <th>{copy.status}</th>
                        <th>{copy.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="admin-table-empty">
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
                                  className="btn btn-outline admin-table-action"
                                  onClick={() => openProductModal(product)}
                                >
                                  <Pencil size={15} />
                                  {copy.edit}
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

              saveProductDraft({
                ...productModal.draft,
                category: productModal.draft.category || selectableCategories[0].slug,
                variants: parseVariants(productModal.variantsText),
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
                <span>{copy.variants}</span>
                <textarea
                  rows={4}
                  value={productModal.variantsText}
                  onChange={(event) =>
                    setProductModal({
                      ...productModal,
                      variantsText: event.target.value,
                    })
                  }
                />
                <small>{copy.variantsHelp}</small>
              </label>
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
    </div>
  );
}
