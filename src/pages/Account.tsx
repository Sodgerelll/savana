import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareQuote,
  Package,
  Percent,
  RotateCcw,
  Store,
  Trash2,
  UserCircle2,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStorefront } from "../context/StorefrontContext";
import { useLanguage } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import type { Collection, Discount, Product } from "../data/products";
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
  type UserProfile,
  type UserRole,
} from "../lib/userProfiles";
import { subscribeToContactMessages, type ContactMessageRecord } from "../lib/contactMessages";
import {
  createManualOrder,
  subscribeToOrders,
  subscribeToUserOrders,
  updateOrderByAdmin,
  SHIPPING_FEE,
  type OrderItemPayload,
  type OrderPaymentMethod,
  type OrderRecord,
  type OrderSource,
  type OrderStatus,
} from "../lib/orders";
import { DEFAULT_ADDRESS_REGION } from "../lib/checkoutAddress";
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
  localDateKey,
} from "../lib/storefrontHelpers";
import { uploadStorefrontImage } from "../lib/storageUpload";
import { subscribeToPackaging, savePackaging, deletePackaging, type PackagingItem } from "../lib/storefrontRepository";
import {
  addRawMaterialPurchase,
  deleteRawMaterial,
  removeRawMaterialPurchase,
  saveRawMaterial,
  subscribeToRawMaterials,
  type RawMaterial,
} from "../lib/rawMaterials";
import {
  advanceProductionBatch,
  createProductionBatch,
  deleteProductionBatch,
  subscribeToProductionBatches,
  updateProductionBatch,
  type ProductionBatch,
  type ProductionBatchStatus,
  type ProductionBatchSupply,
} from "../lib/productionBatches";
import {
  createCustomer,
  createEmptyCustomerDraft,
  getNextCustomerCode,
  subscribeToCustomers,
  updateCustomer,
  type CustomerRecord,
  type CustomerType,
} from "../lib/customers";
import {
  checkProductHasTransactions,
  createCustomerTransaction,
  createEmptyTransactionDraft,
  deleteCustomerTransaction,
  deleteCustomerTransactionPaymentEntry,
  recordCustomerTransactionPayment,
  subscribeToCustomerTransactions,
  updateCustomerTransaction,
  updateCustomerTransactionPaymentEntry,
  type CustomerTransactionRecord,
  type CustomerTransactionType,
} from "../lib/customerTransactions";
import { checkProductHasTransfers, deleteCustomerCascade } from "../services/transferService";
import { createDirectSale, updateDirectSale, deleteDirectSale, subscribeToDirectSales, type DirectSaleRecord } from "../lib/directSales";
import { createFinanceEntry, updateFinanceEntry, deleteFinanceEntry, subscribeToFinanceEntries, type FinanceEntryRecord } from "../lib/financeEntries";
import { saveWeeklyKpi, subscribeToWeeklyKpis, type FinanceWeeklyKpiRecord } from "../lib/financeKpis";
import { createFinanceRecurring, updateFinanceRecurring, deleteFinanceRecurring, subscribeToFinanceRecurring, materializeDueRecurringEntries, type FinanceRecurringRecord } from "../lib/financeRecurring";
import { subscribeToCrmPayments, type CrmPaymentRecord } from "../lib/crmPayments";
import logoBlack from "../assets/logoBlack.png";
import DashboardPage from "./admin/DashboardPage";
import AnalyticsPage from "./admin/AnalyticsPage";
import WebsitePage from "./admin/WebsitePage";
import CategoriesPage from "./admin/CategoriesPage";
import OrdersPage from "./admin/OrdersPage";
import UsersPage from "./admin/UsersPage";
import CrmCustomersPage from "./admin/CrmCustomersPage";
import CrmCustomerTransactionsPage from "./admin/CrmCustomerTransactionsPage";
import CrmOverviewPage from "./admin/CrmOverviewPage";
import FactoryOverviewPage from "./admin/FactoryOverviewPage";
import FactoryProductionPage from "./admin/FactoryProductionPage";
import FactoryInventoryPage from "./admin/FactoryInventoryPage";
import RawMaterialsPage from "./admin/RawMaterialsPage";
import ProductsPage from "./admin/ProductsPage";
import MessagesPage from "./admin/MessagesPage";
import DirectSalesPage from "./admin/DirectSalesPage";
import FinancePage from "./admin/FinancePage";
import FinancePaymentsPage from "./admin/FinancePaymentsPage";
import FinanceReconciliationPage from "./admin/FinanceReconciliationPage";
import FinanceReportsPage from "./admin/FinanceReportsPage";
import AdminModals from "./admin/AdminModals";
import DiscountsPage from "./admin/DiscountsPage";
import {
  subscribeToJournalEntries,
  subscribeToChartOfAccounts,
  type JournalEntryRecord,
  type AccountRecord,
} from "../lib/accounting/journalQueries";
import { getAdminCopy } from "./admin/adminCopy";
import {
  cloneVariants,
  cloneProduct,
  cloneOrderRecord,
  getUserIdentity,
  getRoleLabel,
  getManageableRoleOptions,
  getUserProviderSummary,
  getAuthMethodLabel,
  getOrderStatusLabel,
  getOrderStatusClassName,
  getOrderSourceLabel,
  getOrderSourceOptions,
  getOrderTotalQuantity,
  getOrderPaymentStatusLabel,
  formatAdminDateTime,
  getLocalizedManagedText,
  getManagedNavigationLabel,
  getManagedJournalTitle,
  getManagedJournalCategory,
} from "./admin/adminHelpers";
import type { AdminCtx } from "./admin/adminShellTypes";
import "./Auth.css";

type AdminSection =
  | "dashboard"
  | "website"
  | "analytics"
  | "categories"
  | "products"
  | "discounts"
  | "directSales"
  | "messages"
  | "orders"
  | "users"
  | "crmOverview"
  | "crmCustomers"
  | "crmCustomerTransactions"
  | "crmService"
  | "financeOverview"
  | "financePayments"
  | "financeReconciliation"
  | "financeReports"
  | "factoryOverview"
  | "factoryProduction"
  | "rawMaterials"
  | "factoryInventory";
type ModalMode = "create" | "edit" | "edit-limited";

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

interface DiscountModalState {
  mode: ModalMode;
  draft: Discount;
  /** Create mode: products the discount will be applied to (multi-select). */
  selectedProductIds?: number[];
}

interface ConfirmModalState {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface OrderModalState {
  draft: OrderRecord;
}

/** Draft behind the "register an order by hand" modal on the Orders page. */
interface ManualOrderDraft {
  source: OrderSource;
  status: OrderStatus;
  paymentMethod: OrderPaymentMethod;
  customer: OrderRecord["customer"];
  address: OrderRecord["address"];
  items: OrderItemPayload[];
  shippingFee: number;
}

interface ManualOrderModalState {
  draft: ManualOrderDraft;
}

interface UserProfileModalState {
  draft: UserProfile;
}

interface PackagingModalState {
  mode: ModalMode;
  draft: PackagingItem;
}

interface RawMaterialModalState {
  mode: ModalMode;
  draft: RawMaterial;
}

interface RawMaterialPurchaseModalState {
  rawMaterialId: number;
  rawMaterialName: string;
  unit: string;
  draft: {
    quantity: number;
    unitCost: number | null;
    supplier: string;
    purchasedAt: string;
    notes: string;
  };
}

interface ProductionBatchDraft {
  id: string;
  batchCode: string;
  productId: number;
  productName: string;
  status: ProductionBatchStatus;
  plannedQuantity: number;
  actualQuantity: number | null;
  startedAt: string | null;
  expectedReadyAt: string | null;
  readyAt: string | null;
  supplies: ProductionBatchSupply[];
  totalCost: number;
  notes: string;
}

interface ProductionBatchModalState {
  mode: ModalMode;
  draft: ProductionBatchDraft;
  previous?: ProductionBatch;
}

interface ProductionAdvanceModalState {
  batch: ProductionBatch;
  targetStatus: ProductionBatchStatus;
  startedAt: string;
  expectedReadyAt: string;
  readyAt: string;
  actualQuantity: number;
  variantName: string;
}

interface CustomerModalState {
  mode: ModalMode;
  draft: CustomerRecord;
}

interface CustomerTransactionModalState {
  mode: ModalMode;
  draft: CustomerTransactionRecord;
  previous?: CustomerTransactionRecord;
}

interface TransactionPaymentModalState {
  customerId: string;
  /** Transaction the payment applies to — selectable in the modal when recording. */
  txId: string | null;
  draft: { date: string; amount: number; note: string };
  /** When set, the modal edits the payment entry at this index instead of recording a new one. */
  editIndex?: number;
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

const VALID_SECTIONS = new Set<string>([
  "dashboard", "website", "categories", "products", "discounts", "messages", "orders", "users",
  "crmOverview", "crmCustomers", "crmCustomerTransactions", "crmService",
  "financeOverview", "financePayments", "financeReconciliation", "financeReports",
  "factoryOverview", "factoryProduction", "rawMaterials", "factoryInventory",
]);

export default function Account() {
  const navigate = useNavigate();
  const { section: urlSection } = useParams<{ section?: string }>();
  const resolvedSection: AdminSection = (urlSection && VALID_SECTIONS.has(urlSection) ? urlSection : "dashboard") as AdminSection;
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
    discounts,
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
    saveDiscountDraft,
    deleteDiscount,
  } = useStorefront();

  const copy = getAdminCopy(language);

  const activeSection = resolvedSection;
  const setActiveSection = (section: AdminSection) => {
    navigate(section === "dashboard" ? "/account" : `/account/${section}`, { replace: true });
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      setSidebarOpen(false);
    }
  };
  const [productSearchName, setProductSearchName] = useState("");
  const [productFilterCategory, setProductFilterCategory] = useState("");
  const [productFilterPriceMin, setProductFilterPriceMin] = useState("");
  const [productFilterPriceMax, setProductFilterPriceMax] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [settingsModal, setSettingsModal] = useState<SettingsModalState | null>(null);
  const [collectionModal, setCollectionModal] = useState<CollectionModalState | null>(null);
  const [productModal, setProductModal] = useState<ProductModalState | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [expandedCustomerTab, setExpandedCustomerTab] = useState<"products" | "history" | "payments">("history");
  const [expandedTxGrids, setExpandedTxGrids] = useState<Set<string>>(new Set());
  const [navigationModal, setNavigationModal] = useState<NavigationModalState | null>(null);
  const [journalSettingsModal, setJournalSettingsModal] = useState<JournalSettingsModalState | null>(null);
  const [journalEntryModal, setJournalEntryModal] = useState<JournalEntryModalState | null>(null);
  const [userProfileModal, setUserProfileModal] = useState<UserProfileModalState | null>(null);
  const [heroBannerModal, setHeroBannerModal] = useState<HeroBannerModalState | null>(null);
  const [marketModal, setMarketModal] = useState<MarketModalState | null>(null);
  const [testimonialModal, setTestimonialModal] = useState<TestimonialModalState | null>(null);
  const [discountModal, setDiscountModal] = useState<DiscountModalState | null>(null);
  const [orderModal, setOrderModal] = useState<OrderModalState | null>(null);
  const [manualOrderModal, setManualOrderModal] = useState<ManualOrderModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [confirmModalLoading, setConfirmModalLoading] = useState(false);
  const [confirmModalError, setConfirmModalError] = useState<string | null>(null);
  const [packagingItems, setPackagingItems] = useState<PackagingItem[]>([]);
  const [packagingModal, setPackagingModal] = useState<PackagingModalState | null>(null);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [rawMaterialModal, setRawMaterialModal] = useState<RawMaterialModalState | null>(null);
  const [rawMaterialSaving, setRawMaterialSaving] = useState(false);
  const [rawMaterialError, setRawMaterialError] = useState<string | null>(null);
  const [rawMaterialPurchaseModal, setRawMaterialPurchaseModal] = useState<RawMaterialPurchaseModalState | null>(null);
  const [rawMaterialPurchaseSaving, setRawMaterialPurchaseSaving] = useState(false);
  const [rawMaterialPurchaseError, setRawMaterialPurchaseError] = useState<string | null>(null);
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>([]);
  const [productionBatchModal, setProductionBatchModal] = useState<ProductionBatchModalState | null>(null);
  const [productionBatchSaving, setProductionBatchSaving] = useState(false);
  const [productionBatchError, setProductionBatchError] = useState<string | null>(null);
  const [productionAdvanceModal, setProductionAdvanceModal] = useState<ProductionAdvanceModalState | null>(null);
  const [productionAdvanceSaving, setProductionAdvanceSaving] = useState(false);
  const [productionAdvanceError, setProductionAdvanceError] = useState<string | null>(null);
  const [navigationBannerUploadError, setNavigationBannerUploadError] = useState<string | null>(null);
  const [navigationBannerUploading, setNavigationBannerUploading] = useState(false);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [journalImageUploadError, setJournalImageUploadError] = useState<string | null>(null);
  const [journalImageUploading, setJournalImageUploading] = useState(false);
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [productImageUploadError, setProductImageUploadError] = useState<string | null>(null);
  const [collectionImageUploading, setCollectionImageUploading] = useState(false);
  const [collectionImageUploadError, setCollectionImageUploadError] = useState<string | null>(null);
  const [savingUserProfile, setSavingUserProfile] = useState(false);
  const [userProfileError, setUserProfileError] = useState<string | null>(null);
  const [savingOrderModal, setSavingOrderModal] = useState(false);
  const [orderModalError, setOrderModalError] = useState<string | null>(null);
  const [savingManualOrder, setSavingManualOrder] = useState(false);
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<ContactMessageRecord[]>([]);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [myOrders, setMyOrders] = useState<OrderRecord[]>([]);
  const [myOrdersError, setMyOrdersError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerModal, setCustomerModal] = useState<CustomerModalState | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<"all" | CustomerType>("all");
  const [customerSavingState, setCustomerSavingState] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<CustomerTransactionRecord[]>([]);
  const [customerTransactionsError, setCustomerTransactionsError] = useState<string | null>(null);
  const [directSales, setDirectSales] = useState<DirectSaleRecord[]>([]);
  const [directSalesError, setDirectSalesError] = useState<string | null>(null);
  const [financeEntries, setFinanceEntries] = useState<FinanceEntryRecord[]>([]);
  const [financeEntriesError, setFinanceEntriesError] = useState<string | null>(null);
  const [financeWeeklyKpis, setFinanceWeeklyKpis] = useState<FinanceWeeklyKpiRecord[]>([]);
  const [financeRecurring, setFinanceRecurring] = useState<FinanceRecurringRecord[]>([]);
  const [crmPayments, setCrmPayments] = useState<CrmPaymentRecord[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntryRecord[]>([]);
  const [journalEntriesError, setJournalEntriesError] = useState<string | null>(null);
  const [chartOfAccounts, setChartOfAccounts] = useState<AccountRecord[]>([]);
  const [transactionModal, setTransactionModal] = useState<CustomerTransactionModalState | null>(null);
  const [transactionSavingState, setTransactionSavingState] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [txPaymentModal, setTxPaymentModal] = useState<TransactionPaymentModalState | null>(null);
  const [txPaymentSaving, setTxPaymentSaving] = useState(false);
  const [txPaymentError, setTxPaymentError] = useState<string | null>(null);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<"all" | CustomerTransactionType>("all");
  const [transactionCustomerFilter, setTransactionCustomerFilter] = useState<string>("all");
  const [customerViewMode, setCustomerViewMode] = useState<"customers" | "transfers">("customers");
  const [openNavGroups, setOpenNavGroups] = useState<Record<AdminMenuGroup["key"], boolean>>({
    common: true,
    website: true,
    crm: false,
    finance: false,
    factory: false,
  });
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [sidebarOpen]);

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
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (productSearchName && !product.name.toLowerCase().includes(productSearchName.toLowerCase())) return false;
      if (productFilterCategory && product.category !== productFilterCategory) return false;
      const minPrice = Number(productFilterPriceMin);
      if (minPrice > 0 && product.price < minPrice) return false;
      const maxPrice = Number(productFilterPriceMax);
      if (maxPrice > 0 && product.price > maxPrice) return false;
      return true;
    });
  }, [products, productSearchName, productFilterCategory, productFilterPriceMin, productFilterPriceMax]);

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
  const totalStockSum = useMemo(() => products.reduce((sum, p) => {
    const hasVariants = (p.variants ?? []).length > 0;
    const variantStock = hasVariants ? p.variants!.reduce((s, v) => s + (v.quantity || 0), 0) : 0;
    return sum + (hasVariants ? variantStock : (p.totalStock ?? 0));
  }, 0), [products]);
  const totalSoldSum = useMemo(() => products.reduce((sum, p) => sum + (p.soldCount ?? 0), 0), [products]);
  const totalRemainingSum = totalStockSum - totalSoldSum;
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
  const orderSourceOptions = useMemo(() => getOrderSourceOptions(language), [language]);
  const manualOrdersCount = useMemo(() => orders.filter((order) => order.isManual).length, [orders]);
  const implementedSections = new Set<AdminSection>([
    "dashboard",
    "website",
    "analytics",
    "categories",
    "products",
    "discounts",
    "directSales",
    "messages",
    "orders",
    "users",
    "factoryOverview",
    "factoryInventory",
    "factoryProduction",
    "rawMaterials",
    "crmOverview",
    "crmCustomers",
    "crmCustomerTransactions",
    "financeOverview",
    "financePayments",
    "financeReconciliation",
    "financeReports",
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
              {
                id: "discounts",
                label: copy.discountsMenu,
                description: copy.discountsText,
                icon: <Percent size={18} />,
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
                id: "analytics",
                label: copy.analyticsMenu,
                description: "Google Analytics-аас хандалтын статистик харна.",
                icon: <Activity size={18} />,
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
                implemented: true,
              },
              {
                id: "crmCustomers",
                label: "Борлуулагч",
                description: "Байгууллага, хувь борлуулагчийн бүртгэл, үлдэгдэл.",
                icon: <Building2 size={18} />,
                implemented: true,
                requiresPrivilege: true,
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
                label: "Орлого, зарлага",
                description: "Сарын орлого, зарлагын бүртгэл, өдрийн календарь, баланс.",
                icon: <WalletCards size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financePayments",
                label: "Төлбөр",
                description: "Бүх сувгийн орсон төлбөр, хүлээгдэж буй нэхэмжлэх.",
                icon: <CheckCircle2 size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financeReconciliation",
                label: "Тулгалт",
                description: "Захиалга, борлуулалт ↔ журналын бичилтийн тулгалт.",
                icon: <RotateCcw size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financeReports",
                label: "Санхүүгийн тайлан",
                description: "Захирлын самбар: P&L, мөнгөн урсгал, журнал, дансны үлдэгдэл.",
                icon: <LayoutDashboard size={18} />,
                implemented: true,
                requiresPrivilege: true,
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
                implemented: true,
              },
              {
                id: "factoryProduction",
                label: "Үйлдвэрлэл",
                description: "Batch planning, work order, BOM execution.",
                icon: <RotateCcw size={18} />,
                implemented: true,
              },
              {
                id: "rawMaterials",
                label: "Түүхий эдийн сан",
                description: "Түүхий эдийн нөөц, зарцуулалт, нэмэх.",
                icon: <Package size={18} />,
                implemented: true,
              },
              {
                id: "factoryInventory",
                label: "Нөөц ба агуулах",
                description: "Raw material, packaging, finished goods inventory.",
                icon: <Store size={18} />,
                implemented: true,
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
              {
                id: "discounts",
                label: copy.discountsMenu,
                description: copy.discountsText,
                icon: <Percent size={18} />,
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
                id: "analytics",
                label: copy.analyticsMenu,
                description: "Visitor stats pulled live from Google Analytics.",
                icon: <Activity size={18} />,
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
                implemented: true,
              },
              {
                id: "crmCustomers",
                label: "Sellers",
                description: "Organization & individual seller records and balances.",
                icon: <Building2 size={18} />,
                implemented: true,
                requiresPrivilege: true,
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
                label: "Income & expenses",
                description: "Monthly income/expense ledger with a daily calendar and balance.",
                icon: <WalletCards size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financePayments",
                label: "Payments",
                description: "All-channel received payments and pending invoices.",
                icon: <CheckCircle2 size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financeReconciliation",
                label: "Reconciliation",
                description: "Documents ↔ journal entry matching.",
                icon: <RotateCcw size={18} />,
                implemented: true,
                requiresPrivilege: true,
              },
              {
                id: "financeReports",
                label: "Financial reports",
                description: "Director dashboard: P&L, cashflow, journal, and trial balance.",
                icon: <LayoutDashboard size={18} />,
                implemented: true,
                requiresPrivilege: true,
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
                implemented: true,
              },
              {
                id: "factoryProduction",
                label: "Production",
                description: "Batch planning, work orders, and BOM execution.",
                icon: <RotateCcw size={18} />,
                implemented: true,
              },
              {
                id: "factoryInventory",
                label: "Inventory",
                description: "Raw material, packaging, and finished goods stock.",
                icon: <Store size={18} />,
                implemented: true,
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
      setCustomers([]);
      setCustomersError(null);
      return;
    }
    return subscribeToCustomers({
      onData: (next) => {
        setCustomers(next);
        setCustomersError(null);
      },
      onError: (subscriptionError) => {
        setCustomersError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setCustomerTransactions([]);
      setCustomerTransactionsError(null);
      return;
    }
    return subscribeToCustomerTransactions({
      onData: (next) => {
        setCustomerTransactions(next);
        setCustomerTransactionsError(null);
      },
      onError: (subscriptionError) => {
        setCustomerTransactionsError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setDirectSales([]);
      setDirectSalesError(null);
      return;
    }
    return subscribeToDirectSales({
      onData: (next) => {
        setDirectSales(next);
        setDirectSalesError(null);
      },
      onError: (subscriptionError) => {
        setDirectSalesError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setFinanceEntries([]);
      setFinanceEntriesError(null);
      return;
    }
    return subscribeToFinanceEntries({
      onData: (next) => {
        setFinanceEntries(next);
        setFinanceEntriesError(null);
      },
      onError: (subscriptionError) => {
        setFinanceEntriesError(subscriptionError.message);
      },
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setFinanceWeeklyKpis([]);
      return;
    }
    return subscribeToWeeklyKpis({
      onData: (next) => setFinanceWeeklyKpis(next),
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setFinanceRecurring([]);
      return;
    }
    return subscribeToFinanceRecurring({
      onData: (next) => setFinanceRecurring(next),
    });
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setCrmPayments([]);
      return;
    }
    return subscribeToCrmPayments({
      onData: (next) => setCrmPayments(next),
    });
  }, [isPrivilegedUser]);

  // Materialize due recurring finance entries. Idempotent (deterministic entry
  // ids + lastGeneratedDate floor), so re-runs and concurrent sessions are safe.
  useEffect(() => {
    if (!isPrivilegedUser || financeRecurring.length === 0) return;
    void materializeDueRecurringEntries(financeRecurring).catch(() => {});
  }, [isPrivilegedUser, financeRecurring]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setJournalEntries([]);
      setJournalEntriesError(null);
      setChartOfAccounts([]);
      return;
    }
    const unsubscribeEntries = subscribeToJournalEntries({
      onData: (next) => {
        setJournalEntries(next);
        setJournalEntriesError(null);
      },
      onError: (subscriptionError) => {
        setJournalEntriesError(subscriptionError.message);
      },
    });
    const unsubscribeAccounts = subscribeToChartOfAccounts({
      onData: (next) => setChartOfAccounts(next),
    });
    return () => {
      unsubscribeEntries();
      unsubscribeAccounts();
    };
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setPackagingItems([]);
      return;
    }
    return subscribeToPackaging(
      (items) => setPackagingItems(items),
      () => {},
    );
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setRawMaterials([]);
      return;
    }
    let alive = true;
    let unsub: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const subscribe = () => {
      unsub = subscribeToRawMaterials(
        (items) => { if (alive) { setRawMaterials(items); setRawMaterialError(null); } },
        (err) => { if (alive) { setRawMaterialError(err.message); retryTimer = setTimeout(subscribe, 5000); } },
      );
    };
    subscribe();
    return () => { alive = false; unsub?.(); if (retryTimer !== undefined) clearTimeout(retryTimer); };
  }, [isPrivilegedUser]);

  useEffect(() => {
    if (!isPrivilegedUser) {
      setProductionBatches([]);
      return;
    }
    let alive = true;
    let unsub: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const subscribe = () => {
      unsub = subscribeToProductionBatches({
        onData: (batches) => { if (alive) { setProductionBatches(batches); setProductionBatchError(null); } },
        onError: (err) => { if (alive) { setProductionBatchError(err.message); retryTimer = setTimeout(subscribe, 5000); } },
      });
    };
    subscribe();
    return () => { alive = false; unsub?.(); if (retryTimer !== undefined) clearTimeout(retryTimer); };
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
    if (!isPrivilegedUser && (activeSection === "users" || activeSection === "orders" || activeSection === "messages" || activeSection === "crmCustomers" || activeSection === "crmCustomerTransactions")) {
      setActiveSection("dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const lockedProductIds = useMemo(() => {
    const locked = new Set<number>();
    customerTransactions.forEach((tx) => {
      tx.items.forEach((item) => locked.add(item.productId));
    });
    orders.forEach((order) => {
      order.items.forEach((item) => locked.add(item.productId));
    });
    return locked;
  }, [customerTransactions, orders]);

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

  const openCollectionModal = (collection?: Collection, parent?: Collection) => {
    if (collection) {
      setCollectionModal({
        mode: "edit",
        draft: { ...collection },
      });
      return;
    }

    const nextId = Math.max(0, ...collections.map((item) => item.id)) + 1;
    const level: 1 | 2 | 3 = parent
      ? (parent.level ?? 1) === 1 ? 2 : 3
      : 1;
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
        level,
        parentId: parent?.id,
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

  const handleCollectionImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !collectionModal) return;

    setCollectionImageUploadError(null);
    setCollectionImageUploading(true);

    try {
      const uploadedImageUrl = await uploadStorefrontImage(file, "collection-images");
      setCollectionModal((current) => {
        if (!current) return current;
        return {
          ...current,
          draft: { ...current.draft, image: uploadedImageUrl },
        };
      });
    } catch {
      setCollectionImageUploadError(copy.bannerUploadFailed);
    } finally {
      setCollectionImageUploading(false);
      event.target.value = "";
    }
  };

  const removeCollectionImage = () => {
    if (!collectionModal) return;
    setCollectionModal({
      ...collectionModal,
      draft: { ...collectionModal.draft, image: "" },
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

  const openDiscountModal = (discount?: Discount) => {
    if (discount) {
      setDiscountModal({ mode: "edit", draft: { ...discount } });
      return;
    }
    const today = localDateKey();
    const nextId = Math.max(0, ...discounts.map((d) => d.id)) + 1;
    setDiscountModal({
      mode: "create",
      selectedProductIds: [],
      draft: {
        id: nextId,
        productId: 0,
        type: "percent",
        value: 10,
        startAt: today,
        endAt: today,
        status: "active",
      },
    });
  };

  const handleDiscountDeleteRequest = (discount: Discount) => {
    openConfirmModal({
      title: copy.confirmDeleteTitle,
      description: copy.deleteDiscountDescription,
      confirmLabel: copy.delete,
      destructive: true,
      onConfirm: async () => {
        deleteDiscount(discount.id);
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
    setConfirmModalError(null);
    setConfirmModalLoading(false);
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

  const handleProductDeleteRequest = async (product: Product) => {
    const [hasTransactions, hasTransfers] = await Promise.all([
      checkProductHasTransactions(product.id),
      checkProductHasTransfers(product.id),
    ]);

    if (hasTransactions || hasTransfers) {
      openConfirmModal({
        title: copy.confirmDeleteTitle,
        description: copy.productDeleteLinkedError,
        confirmLabel: copy.close,
        onConfirm: () => {},
      });
      return;
    }

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

  /**
   * Moves soldCount (and the matching variant's soldCount) by an order's quantities.
   * sign = +1 when the order enters "delivered" (deduct stock), -1 when it leaves.
   * Items are aggregated per product so a product appearing in several order lines
   * (e.g. different variants) is written once.
   */
  const applyOrderSoldCountDelta = (items: OrderItemPayload[], sign: 1 | -1) => {
    const itemsByProduct = new Map<number, OrderItemPayload[]>();
    for (const item of items) {
      const list = itemsByProduct.get(item.productId) ?? [];
      list.push(item);
      itemsByProduct.set(item.productId, list);
    }

    itemsByProduct.forEach((productItems, productId) => {
      const currentProduct = products.find((p) => p.id === productId);
      if (!currentProduct) return;

      let nextSoldCount = currentProduct.soldCount ?? 0;
      const nextVariants = currentProduct.variants?.map((v) => ({ ...v }));

      for (const item of productItems) {
        nextSoldCount = Math.max(0, nextSoldCount + sign * item.quantity);
        if (nextVariants && item.variant) {
          const idx = nextVariants.findIndex((v) => v.name === item.variant);
          if (idx >= 0) {
            nextVariants[idx] = {
              ...nextVariants[idx],
              soldCount: Math.max(0, (nextVariants[idx].soldCount ?? 0) + sign * item.quantity),
            };
          }
        }
      }

      updateProduct(productId, {
        soldCount: nextSoldCount,
        ...(nextVariants ? { variants: nextVariants } : {}),
      });
    });
  };

  const openManualOrderModal = () => {
    setManualOrderModal({
      draft: {
        source: "messenger",
        status: "new",
        paymentMethod: "cash",
        customer: { fullName: "", phoneNumber: "", email: null, note: "" },
        address: {
          region: DEFAULT_ADDRESS_REGION,
          districtOrSoum: "",
          khorooOrBag: "",
          streetAddress: "",
          additionalAddress: "",
        },
        items: [],
        shippingFee: SHIPPING_FEE,
      },
    });
    setManualOrderError(null);
  };

  const closeManualOrderModal = () => {
    if (savingManualOrder) {
      return;
    }

    setManualOrderModal(null);
    setManualOrderError(null);
  };

  const handleManualOrderSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!manualOrderModal) {
      return;
    }

    const draft = manualOrderModal.draft;
    const customer = {
      fullName: draft.customer.fullName.trim(),
      phoneNumber: draft.customer.phoneNumber.trim(),
      email: draft.customer.email?.trim() ? draft.customer.email.trim() : null,
      note: draft.customer.note.trim(),
    };
    const address = {
      region: draft.address.region.trim(),
      districtOrSoum: draft.address.districtOrSoum.trim(),
      khorooOrBag: draft.address.khorooOrBag.trim(),
      streetAddress: draft.address.streetAddress.trim(),
      additionalAddress: draft.address.additionalAddress.trim(),
    };

    const items = draft.items.filter((item) => item.productId > 0 && item.quantity > 0);

    if (items.length === 0) {
      setManualOrderError(
        language === "MN" ? "Дор хаяж нэг бараа нэмнэ үү." : "Add at least one item.",
      );
      return;
    }

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountTotal = items.reduce(
      (sum, item) => sum + Math.max(0, (item.originalUnitPrice ?? item.unitPrice) - item.unitPrice) * item.quantity,
      0,
    );
    const shippingFee = Math.max(0, Math.round(draft.shippingFee));

    setSavingManualOrder(true);
    setManualOrderError(null);

    try {
      await createManualOrder({
        source: draft.source,
        status: draft.status,
        paymentMethod: draft.paymentMethod,
        customer,
        address,
        items,
        totals: {
          subtotal,
          shippingFee,
          grandTotal: subtotal + shippingFee,
          discountTotal,
        },
        createdByUid: user?.uid ?? "",
        createdByName: profile?.displayName ?? user?.email ?? "",
      });

      // Stock is deducted at the "delivered" boundary — same rule the order edit
      // modal applies when an existing order crosses into/out of delivered.
      if (draft.status === "delivered") {
        applyOrderSoldCountDelta(items, 1);
      }

      setManualOrderModal(null);
      setManualOrderError(null);
    } catch (error) {
      setManualOrderError(
        error instanceof Error
          ? error.message
          : language === "MN"
            ? "Захиалга бүртгэж чадсангүй."
            : "Unable to register the order.",
      );
    } finally {
      setSavingManualOrder(false);
    }
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

  const handleOrderSourceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSource = event.target.value as OrderSource;
    setOrderModal((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              source: nextSource,
            },
          }
        : current
    );
  };

  const handleOrderPaymentMethodChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextMethod = event.target.value as import("../lib/orders").OrderPaymentMethod;
    setOrderModal((current) => {
      if (!current) return current;
      const isBonum = nextMethod === "bonum";
      return {
        ...current,
        draft: {
          ...current.draft,
          payment: {
            ...current.draft.payment,
            method: nextMethod,
            provider: nextMethod,
            ...(!isBonum && {
              qrPayload: "",
              invoiceId: null,
              bonumPaymentVendor: undefined,
              bonumCompletedAt: undefined,
              bonumTerminalId: undefined,
              bonumAmount: undefined,
            }),
          },
        },
      };
    });
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
      const wasDelivered = originalOrder?.status === "delivered";
      const willBeDelivered = orderModal.draft.status === "delivered";

      await updateOrderByAdmin(orderModal.draft.id, {
        status: orderModal.draft.status,
        source: orderModal.draft.source,
        customer: nextCustomer,
        address: nextAddress,
        payment: orderModal.draft.payment,
      });

      // Adjust soldCount only when crossing the "delivered" boundary.
      if (originalOrder && wasDelivered !== willBeDelivered) {
        applyOrderSoldCountDelta(originalOrder.items, willBeDelivered ? 1 : -1);
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

  const adminCtx: AdminCtx = {
    // copy + i18n
    copy,
    language,
    // storefront data
    settings,
    collections,
    products,
    heroBanners,
    markets,
    testimonials,
    discounts,
    loading,
    saving,
    error,
    backend,
    structure,
    visibleSettings,
    activeNavigationItems,
    activeJournalEntries,
    activeCollections,
    activeProducts,
    activeHeroBanners,
    activeMarkets,
    activeTestimonials,
    navigationPreviewItems,
    journalPreviewEntries,
    inactiveNavigationItems,
    selectableCategories,
    bannerCategories,
    collectionNameBySlug,
    filteredProducts,
    regularCollectionCount,
    productCountByCategory,
    inactiveCollectionsCount,
    inactiveProductsCount,
    linkedCollectionCount,
    bestSellerCount,
    totalStockSum,
    totalSoldSum,
    totalRemainingSum,
    lockedProductIds,
    // user / auth
    user,
    profile,
    role,
    isPrivilegedUser,
    currentRegistrationMethod,
    directoryUsers,
    directoryError,
    userRoleCounts,
    // orders
    orders,
    ordersError,
    paidOrdersCount,
    deliveringOrdersCount,
    deliveredOrdersCount,
    guestOrdersCount,
    orderStatusOptions,
    orderSourceOptions,
    manualOrdersCount,
    // messages
    contactMessages,
    contactMessagesError,
    contactMessagesLast7DaysCount,
    latestContactMessageAt,
    // direct sales
    directSales,
    directSalesError,
    createDirectSale,
    updateDirectSale,
    deleteDirectSale,
    // finance
    journalEntries,
    journalEntriesError,
    chartOfAccounts,
    financeEntries,
    financeEntriesError,
    createFinanceEntry,
    updateFinanceEntry,
    deleteFinanceEntry,
    financeWeeklyKpis,
    saveWeeklyKpi,
    financeRecurring,
    createFinanceRecurring,
    updateFinanceRecurring,
    deleteFinanceRecurring,
    crmPayments,
    // customers / transactions
    customers,
    customersError,
    customerSearch,
    setCustomerSearch,
    customerTypeFilter,
    setCustomerTypeFilter,
    customerViewMode,
    setCustomerViewMode,
    customerTransactions,
    customerTransactionsError,
    transactionTypeFilter,
    setTransactionTypeFilter,
    transactionCustomerFilter,
    setTransactionCustomerFilter,
    expandedCustomerId,
    setExpandedCustomerId,
    expandedCustomerTab,
    setExpandedCustomerTab,
    expandedTxGrids,
    setExpandedTxGrids,
    // inventory / production
    packagingItems,
    rawMaterials,
    rawMaterialError,
    productionBatches,
    productionBatchError,
    productionAdvanceError,
    // navigation state
    adminMenuGroups,
    activeMenuGroup,
    activeMenuItem,
    architectureSection,
    implementedSections,
    activeSection,
    setActiveSection,
    // misc UI state
    productSearchName,
    setProductSearchName,
    productFilterCategory,
    setProductFilterCategory,
    productFilterPriceMin,
    setProductFilterPriceMin,
    productFilterPriceMax,
    setProductFilterPriceMax,
    expandedProductId,
    setExpandedProductId,
    // modal openers
    openSettingsModal,
    openCollectionModal,
    openProductModal,
    openHeroBannerModal,
    openNavigationModal,
    openJournalEntryModal,
    openJournalSettingsModal,
    openMarketModal,
    openTestimonialModal,
    openUserProfileModal,
    openOrderModal,
    openManualOrderModal,
    setCustomerModal,
    setTransactionModal,
    setPackagingModal,
    setRawMaterialModal,
    setProductionBatchModal,
    setProductionAdvanceModal,
    // delete request handlers
    handleCollectionDeleteRequest,
    handleProductDeleteRequest,
    handleHeroBannerDeleteRequest,
    handleMarketDeleteRequest,
    handleTestimonialDeleteRequest,
    handleNavigationDeleteRequest,
    handleJournalEntryDeleteRequest,
    handleDiscountDeleteRequest,
    // helpers
    formatAdminDateTime,
    formatStorePrice,
    getOrderStatusLabel,
    getOrderStatusClassName,
    getOrderSourceLabel,
    getOrderPaymentStatusLabel,
    getOrderTotalQuantity,
    getAuthMethodLabel,
    getRoleLabel,
    getUserIdentity,
    getCollectionPrimaryImage,
    getProductPrimaryImage,
    getLocalizedManagedText,
    getManagedNavigationLabel,
    getManagedJournalTitle,
    getManagedJournalCategory,
    isSystemCollection,
    resolveUserRole,
    // delete operations
    deletePackaging,
    deleteRawMaterial,
    deleteProductionBatch,
    deleteCustomer: deleteCustomerCascade,
    deleteCustomerTransaction,
    // create/get helpers
    createEmptyCustomerDraft,
    getNextCustomerCode,
    createEmptyTransactionDraft,
    // confirm modal
    openConfirmModal,
    // error setters
    setTransactionError,
    setCustomerError,
    setRawMaterialError,
    setProductionBatchError,
    setProductionAdvanceError,
    // storefront operations for modals
    saveSettingsDraft,
    saveCollectionDraft,
    saveProductDraft,
    saveHeroBannerDraft,
    saveMarketDraft,
    saveTestimonialDraft,
    saveDiscountDraft,
    saveSettingsSection,
    savePackaging,
    saveRawMaterial,
    createProductionBatch,
    updateProductionBatch,
    advanceProductionBatch,
    createCustomer,
    updateCustomer,
    createCustomerTransaction,
    updateCustomerTransaction,
    getManageableRoleOptions,
    getUserProviderSummary,
    // modal state
    settingsModal,
    setSettingsModal,
    navigationModal,
    setNavigationModal,
    closeNavigationModal,
    handleNavigationBannerFileChange,
    navigationBannerUploading,
    navigationBannerUploadError,
    setNavigationBannerUploadError,
    journalSettingsModal,
    setJournalSettingsModal,
    journalEntryModal,
    setJournalEntryModal,
    closeJournalEntryModal,
    handleJournalEntryFileChange,
    journalImageUploading,
    journalImageUploadError,
    setJournalImageUploadError,
    setJournalImageUploading,
    collectionModal,
    setCollectionModal,
    collectionImageUploading,
    collectionImageUploadError,
    setCollectionImageUploading,
    setCollectionImageUploadError,
    handleCollectionImageUpload,
    removeCollectionImage,
    heroBannerModal,
    setHeroBannerModal,
    closeHeroBannerModal,
    handleHeroBannerFileChange,
    bannerUploading,
    bannerUploadError,
    setBannerUploadError,
    productModal,
    setProductModal,
    productImageUploading,
    productImageUploadError,
    setProductImageUploading,
    setProductImageUploadError,
    handleProductImageUpload,
    removeProductImage,
    marketModal,
    setMarketModal,
    testimonialModal,
    setTestimonialModal,
    discountModal,
    setDiscountModal,
    openDiscountModal,
    packagingModal,
    rawMaterialModal,
    rawMaterialSaving,
    setRawMaterialSaving,
    rawMaterialPurchaseModal,
    setRawMaterialPurchaseModal,
    rawMaterialPurchaseSaving,
    setRawMaterialPurchaseSaving,
    rawMaterialPurchaseError,
    setRawMaterialPurchaseError,
    addRawMaterialPurchase,
    removeRawMaterialPurchase,
    productionBatchModal,
    productionBatchSaving,
    setProductionBatchSaving,
    productionAdvanceModal,
    productionAdvanceSaving,
    setProductionAdvanceSaving,
    customerModal,
    customerSavingState,
    setCustomerSavingState,
    customerError,
    transactionModal,
    transactionSavingState,
    setTransactionSavingState,
    transactionError,
    txPaymentModal,
    setTxPaymentModal,
    txPaymentSaving,
    setTxPaymentSaving,
    txPaymentError,
    setTxPaymentError,
    recordCustomerTransactionPayment,
    updateCustomerTransactionPaymentEntry,
    deleteCustomerTransactionPaymentEntry,
    orderModal,
    closeOrderModal,
    handleOrderCustomerChange,
    handleOrderAddressChange,
    handleOrderStatusChange,
    handleOrderSourceChange,
    handleOrderPaymentMethodChange,
    handleOrderModalSubmit,
    orderModalError,
    savingOrderModal,
    manualOrderModal,
    setManualOrderModal,
    closeManualOrderModal,
    handleManualOrderSubmit,
    manualOrderError,
    setManualOrderError,
    savingManualOrder,
    userProfileModal,
    setUserProfileModal,
    closeUserProfileModal,
    handleUserProfileSubmit,
    userProfileError,
    savingUserProfile,
    confirmModal,
    setConfirmModal,
    confirmModalLoading,
    confirmModalError,
    setConfirmModalLoading,
    setConfirmModalError,
  };

  return (
    <div className="admin-page">
      <div className={`admin-shell ${sidebarOpen ? "" : "admin-shell-collapsed"}`}>
        {sidebarOpen && (
          <div
            className="admin-sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
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
            <DashboardPage ctx={adminCtx} />
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
            <WebsitePage ctx={adminCtx} />
          ) : activeSection === "analytics" ? (
            <AnalyticsPage ctx={adminCtx} />
          ) : activeSection === "messages" ? (
            <MessagesPage ctx={adminCtx} />
          ) : activeSection === "orders" ? (
            <OrdersPage ctx={adminCtx} />
          ) : activeSection === "users" ? (
            <UsersPage ctx={adminCtx} />
          ) : activeSection === "categories" ? (
            <CategoriesPage ctx={adminCtx} />
          ) : activeSection === "discounts" ? (
            <DiscountsPage ctx={adminCtx} />
          ) : activeSection === "crmOverview" ? (
            <CrmOverviewPage ctx={adminCtx} />
          ) : activeSection === "crmCustomers" ? (
            <CrmCustomersPage ctx={adminCtx} />
          ) : activeSection === "crmCustomerTransactions" ? (
            <CrmCustomerTransactionsPage ctx={adminCtx} />
          ) : activeSection === "factoryOverview" ? (
            <FactoryOverviewPage ctx={adminCtx} />
          ) : activeSection === "factoryProduction" ? (
            <FactoryProductionPage ctx={adminCtx} />
          ) : activeSection === "rawMaterials" ? (
            <RawMaterialsPage ctx={adminCtx} />
          ) : activeSection === "factoryInventory" ? (
            <FactoryInventoryPage ctx={adminCtx} />
          ) : activeSection === "directSales" ? (
            <DirectSalesPage ctx={adminCtx} />
          ) : activeSection === "financeOverview" ? (
            <FinancePage ctx={adminCtx} />
          ) : activeSection === "financePayments" ? (
            <FinancePaymentsPage ctx={adminCtx} />
          ) : activeSection === "financeReconciliation" ? (
            <FinanceReconciliationPage ctx={adminCtx} />
          ) : activeSection === "financeReports" ? (
            <FinanceReportsPage ctx={adminCtx} />
          ) : (
            <ProductsPage ctx={adminCtx} />
          )}
        </section>
      </div>

      <AdminModals ctx={adminCtx} />
    </div>
  );
}
