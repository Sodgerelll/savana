/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
import { AdminModal } from "./AdminModal";
import type { AdminCtx } from "./adminShellTypes";
import { getProductCode, getProductLabel } from "./adminHelpers";
import type { EntityStatus } from "../../data/products";
import type { SiteNavigationItem } from "../../data/storefront";
import type { RawMaterialCategory } from "../../lib/rawMaterials";
import {
  buildSuppliesFromRecipe,
  calculateSuppliesCost,
  findRecipeFor,
} from "../../lib/productionRecipes";
import { applyDiscount, buildCategoryTree, getActiveDiscount } from "../../lib/storefrontHelpers";
import { getDistrictOrSoumOptions, getKhorooOrBagOptions, getRegionOptions } from "../../lib/checkoutAddress";
import { SHIPPING_FEE } from "../../lib/orders";
import { calculateSaleVat, saleChannelRequiresAddress, type SaleDiscountType } from "../../lib/sales";
import { calculateVat, normalizeVatMode, type VatMode } from "../../lib/vat";
import type { CustomerType } from "../../lib/customers";
import {
  getCrmContactDisplayName,
  searchCrmContacts,
  type CrmContactRecord,
} from "../../lib/crmContacts";
import type { CustomerTransactionItem, CustomerTransactionPaymentMethod, CustomerTransactionRecord } from "../../lib/customerTransactions";
import type { UserRole } from "../../lib/userProfiles";

function CatLeaf({ node, selected, onSelect, indent, bold }: { node: any; selected: boolean; onSelect: () => void; indent: number; bold?: boolean }) {
  return (
    <button
      type="button"
      className={`admin-cat-item${selected ? " admin-cat-selected" : ""}`}
      style={{ paddingLeft: 10 + indent, fontWeight: bold ? 600 : 400 }}
      onClick={onSelect}
    >
      <span className="admin-cat-code">{node.code}</span>
      {node.collection.name}
      {selected && <span className="admin-cat-check">✓</span>}
    </button>
  );
}

/**
 * An inline card whose body folds away. Used for optional modal sections so the form
 * opens short — the state lives here, so it resets to collapsed whenever the modal
 * (and with it this component) unmounts.
 */
function AdminCollapsibleCard({
  title,
  note,
  defaultOpen = false,
  children,
}: {
  title: string;
  note?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="admin-inline-card">
      <button
        type="button"
        className="admin-inline-card-head admin-inline-card-toggle"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
      >
        <strong>{title}</strong>
        <span className="admin-inline-card-toggle-meta">
          {note && <small className="admin-inline-note">{note}</small>}
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && children}
    </div>
  );
}

/** How many directory matches the sale picker lists before asking for a narrower search. */
const SALE_CONTACT_SUGGESTION_LIMIT = 8;

/**
 * Type-ahead over the customer directory, used when registering a sale. Picking a
 * customer is never required — a walk-in can still be typed straight into the fields
 * below it, and the selection can be cleared to go back to typing.
 */
function SaleContactPicker({
  contacts,
  selectedId,
  copy,
  language,
  onSelect,
  onClear,
}: {
  contacts: CrmContactRecord[];
  selectedId: string | null;
  copy: any;
  language: "MN" | "EN";
  onSelect: (contact: CrmContactRecord) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState("");
  const selected = contacts.find((contact) => contact.id === selectedId) ?? null;

  const matches = useMemo(() => {
    // Inactive contacts stay searchable by name so an old customer can still be picked,
    // but they never fill the suggestion list on an empty search.
    const pool = term.trim() ? contacts : contacts.filter((contact) => contact.status === "active");
    return searchCrmContacts(pool, term).slice(0, SALE_CONTACT_SUGGESTION_LIMIT);
  }, [contacts, term]);

  if (selected) {
    return (
      <div className="admin-inline-card" style={{ marginBottom: "0.75rem" }}>
        <div
          className="admin-inline-card-head"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}
        >
          <div>
            <strong>{getCrmContactDisplayName(selected) || selected.code}</strong>
            <small className="admin-inline-note" style={{ display: "block" }}>
              {[selected.code, selected.phoneNumber].filter(Boolean).join(" · ")}
            </small>
          </div>
          <button type="button" className="admin-filter-clear" onClick={onClear}>
            <X size={14} />
            {copy.saleContactClear}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-inline-card" style={{ marginBottom: "0.75rem" }}>
      <div className="admin-inline-card-head">
        <strong>{copy.saleContactPicker}</strong>
        <small className="admin-inline-note">{copy.saleContactPickerNote}</small>
      </div>
      <div style={{ padding: "0 0.85rem 0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Search size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          <input
            type="text"
            className="admin-search-input"
            style={{ flex: 1 }}
            placeholder={copy.contactSearchPlaceholder}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>
        {contacts.length === 0 ? (
          <small className="admin-inline-note" style={{ display: "block", marginTop: "0.5rem" }}>
            {copy.contactEmpty}
          </small>
        ) : matches.length === 0 ? (
          <small className="admin-inline-note" style={{ display: "block", marginTop: "0.5rem" }}>
            {copy.saleContactNoMatch}
          </small>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "0.5rem" }}>
            {matches.map((contact) => (
              <button
                key={contact.id}
                type="button"
                className="admin-cat-item"
                style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}
                onClick={() => {
                  onSelect(contact);
                  setTerm("");
                }}
              >
                <span className="admin-cat-code">{contact.code}</span>
                {getCrmContactDisplayName(contact) || "—"}
                <small className="admin-inline-note" style={{ marginLeft: "0.5rem" }}>
                  {[
                    contact.type === "organization" ? copy.customerTypeOrg : copy.customerTypeInd,
                    contact.phoneNumber,
                    contact.status === "inactive" ? (language === "MN" ? "идэвхгүй" : "inactive") : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminModals({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    customers,
    products,
    discounts,
    collections,
    selectableCategories,
    bannerCategories,
    rawMaterials,
    orderStatusOptions,
    user,
    isSystemCollection,
    formatAdminDateTime,
    formatStorePrice,
    getOrderTotalQuantity,
    // storefront operations
    saveSettingsDraft,
    saveCollectionDraft,
    saveProductDraft,
    saveHeroBannerDraft,
    saveMarketDraft,
    saveTestimonialDraft,
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
    getAuthMethodLabel,
    getRoleLabel,
    getProductPrimaryImage,
    getManagedJournalTitle,
    getManagedJournalCategory,
    collectionNameBySlug,
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
    handleProductImageUpload,
    removeProductImage,
    marketModal,
    setMarketModal,
    testimonialModal,
    setTestimonialModal,
    packagingModal,
    setPackagingModal,
    rawMaterialModal,
    setRawMaterialModal,
    rawMaterialSaving,
    setRawMaterialSaving,
    rawMaterialError,
    setRawMaterialError,
    rawMaterialPurchaseModal,
    setRawMaterialPurchaseModal,
    rawMaterialPurchaseSaving,
    setRawMaterialPurchaseSaving,
    rawMaterialPurchaseError,
    setRawMaterialPurchaseError,
    addRawMaterialPurchase,
    productionBatchModal,
    setProductionBatchModal,
    productionBatchSaving,
    setProductionBatchSaving,
    productionBatchError,
    setProductionBatchError,
    productionAdvanceModal,
    setProductionAdvanceModal,
    productionAdvanceSaving,
    setProductionAdvanceSaving,
    productionAdvanceError,
    setProductionAdvanceError,
    productionRecipes,
    productionRecipeModal,
    setProductionRecipeModal,
    productionRecipeSaving,
    setProductionRecipeSaving,
    productionRecipeError,
    setProductionRecipeError,
    createProductionRecipe,
    updateProductionRecipe,
    customerModal,
    setCustomerModal,
    customerSavingState,
    setCustomerSavingState,
    customerError,
    setCustomerError,
    crmContacts,
    crmContactModal,
    setCrmContactModal,
    crmContactModalError,
    savingCrmContact,
    closeCrmContactModal,
    handleCrmContactSubmit,
    transactionModal,
    setTransactionModal,
    transactionSavingState,
    setTransactionSavingState,
    transactionError,
    setTransactionError,
    customerTransactions,
    txPaymentModal,
    setTxPaymentModal,
    txPaymentSaving,
    setTxPaymentSaving,
    txPaymentError,
    setTxPaymentError,
    recordCustomerTransactionPayment,
    updateCustomerTransactionPaymentEntry,
    orderModal,
    closeOrderModal,
    handleOrderCustomerChange,
    handleOrderAddressChange,
    handleOrderStatusChange,
    handleOrderPaymentMethodChange,
    handleOrderModalSubmit,
    orderModalError,
    savingOrderModal,
    saleModal,
    setSaleModal,
    closeSaleModal,
    handleSaleSubmit,
    saleModalError,
    savingSale,
    saleChannelOptions,
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
  } = ctx;

  return (
    <>
{settingsModal && (
  <AdminModal
    title={copy.settingsModalTitle}
    description={copy.settingsModalText}
    onClose={() => setSettingsModal(null)}
    wide
  >
    <form
      className="admin-modal-form"
      onSubmit={(event: any)=> {
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
      onSubmit={(event: any)=> {
        event.preventDefault();

        if (navigationBannerUploading) {
          return;
        }

        saveSettingsSection((draft: any)=> ({
          ...draft,
          navigationItems: draft.navigationItems.map((item: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
      onSubmit={(event: any)=> {
        event.preventDefault();
        saveSettingsSection((draft: any)=> ({
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
      onSubmit={(event: any)=> {
        event.preventDefault();

        if (journalImageUploading) {
          return;
        }

        saveSettingsSection((draft: any)=> ({
          ...draft,
          journalEntries:
            journalEntryModal.mode === "create"
              ? [...draft.journalEntries, journalEntryModal.draft]
              : draft.journalEntries.map((entry: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
    disableClose={collectionImageUploading}
  >
    <form
      className="admin-modal-form"
      onSubmit={(event: any)=> {
        event.preventDefault();
        if (collectionImageUploading) return;
        saveCollectionDraft(collectionModal.draft);
        setCollectionModal(null);
      }}
    >
      <div className="admin-form-grid">
        <label className="admin-field">
          <span>{copy.status}</span>
          <select
            value={collectionModal.draft.status}
            onChange={(event: any)=>
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
        {(collectionModal.draft.level ?? 1) >= 2 && (() => {
          const parentCollection = collections.find((c: any) => c.id === collectionModal.draft.parentId);
          const levelLabel =
            collectionModal.draft.level === 2 ? copy.categoryLevelCategory : copy.categoryLevelType;
          return (
            <div className="admin-field admin-field-wide">
              <span>{copy.categoryLevel}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{levelLabel}</strong>
                {parentCollection && (
                  <small style={{ opacity: 0.6 }}>
                    {copy.categoryParentLabel} {parentCollection.name}
                  </small>
                )}
              </div>
            </div>
          );
        })()}
        <label className="admin-field admin-field-wide">
          <span>{copy.name}</span>
          <input
            autoFocus
            value={collectionModal.draft.name}
            onChange={(event: any)=>
              setCollectionModal({
                ...collectionModal,
                draft: { ...collectionModal.draft, name: event.target.value },
              })
            }
          />
        </label>
        <div className="admin-field admin-field-wide">
          <span>{copy.image}</span>
          <div className="admin-product-images">
            {collectionModal.draft.image ? (
              <div className="admin-product-image-item">
                <img
                  src={collectionModal.draft.image}
                  alt={collectionModal.draft.name || copy.collections}
                  className="admin-product-image-preview"
                />
                <button type="button" className="admin-product-image-remove" onClick={removeCollectionImage}>
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <label className="admin-product-image-add">
                <Plus size={20} />
                <span>{copy.addImage}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCollectionImageUpload}
                  disabled={collectionImageUploading}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>
          {collectionImageUploading && <small>{copy.bannerUploadProgress}</small>}
          {collectionImageUploadError && <small className="admin-field-error">{collectionImageUploadError}</small>}
        </div>
        <label className="admin-field admin-field-wide">
          <span>{copy.featuredProduct}</span>
          <select
            value={collectionModal.draft.featuredProductId ?? ""}
            onChange={(event: any)=>
              setCollectionModal({
                ...collectionModal,
                draft: {
                  ...collectionModal.draft,
                  featuredProductId: event.target.value ? Number(event.target.value) : undefined,
                },
              })
            }
          >
            <option value="">{copy.featuredProductNone}</option>
            {products
              .filter((p: any)=> p.category === collectionModal.draft.slug)
              .map((p: any)=> (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <small>{copy.featuredProductHelp}</small>
        </label>
        <label className="admin-field admin-field-wide">
          <span>{copy.description}</span>
          <textarea
            rows={3}
            value={collectionModal.draft.description}
            onChange={(event: any)=>
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
        <button type="submit" className="btn btn-primary" disabled={collectionImageUploading}>
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
      onSubmit={(event: any)=> {
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
              setHeroBannerModal({
                ...heroBannerModal,
                draft: {
                  ...heroBannerModal.draft,
                  collectionSlug: event.target.value,
                },
              })
            }
          >
            {bannerCategories.map((collection: any)=> (
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
            onChange={(event: any)=>
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
    title={productModal.mode === "create" ? copy.productModalCreate : `${getProductCode(productModal.draft.id)} ${copy.productModalEdit}`}
    description={copy.productSummary}
    onClose={() => setProductModal(null)}
  >
    <form
      className="admin-modal-form"
      onSubmit={(event: any)=> {
        event.preventDefault();

        if (selectableCategories.length === 0) {
          return;
        }

        const cleanedVariants = productModal.draft.variants?.filter((v: any)=> v.name.trim()) ?? [];
        const hasVariants = cleanedVariants.length > 0;
        const computedStock = hasVariants
          ? cleanedVariants.reduce((sum: any, v: any)=> sum + (v.quantity || 0), 0)
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
              setProductModal({
                ...productModal,
                draft: { ...productModal.draft, name: event.target.value },
              })
            }
          />
        </label>
        <div className="admin-field admin-field-wide">
          <span>{copy.category}</span>
          <div className="admin-category-tree-picker">
            {buildCategoryTree(collections).map((g: any) => (
              <div key={g.collection.id} className="admin-cat-group">
                <CatLeaf node={g} selected={productModal.draft.category === g.collection.slug} onSelect={() => setProductModal({ ...productModal, draft: { ...productModal.draft, category: g.collection.slug } })} indent={0} bold />
                {g.children.map((cat: any) => (
                  <div key={cat.collection.id}>
                    <CatLeaf node={cat} selected={productModal.draft.category === cat.collection.slug} onSelect={() => setProductModal({ ...productModal, draft: { ...productModal.draft, category: cat.collection.slug } })} indent={16} />
                    {cat.children.map((typ: any) => (
                      <CatLeaf key={typ.collection.id} node={typ} selected={productModal.draft.category === typ.collection.slug} onSelect={() => setProductModal({ ...productModal, draft: { ...productModal.draft, category: typ.collection.slug } })} indent={32} />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <label className="admin-field">
          <span>{copy.price}</span>
          <input
            type="number"
            step="0.01"
            value={productModal.draft.price}
            onChange={(event: any)=>
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
          <span>{copy.costPrice}</span>
          <input
            type="number"
            step="1"
            min={0}
            value={productModal.draft.costPrice ?? 0}
            onChange={(event: any)=>
              setProductModal({
                ...productModal,
                draft: {
                  ...productModal.draft,
                  costPrice: Math.max(0, Number(event.target.value) || 0),
                },
              })
            }
          />
          <small>{copy.costPriceHelp}</small>
        </label>
        <label className="admin-field">
          <span>{copy.wholesalePrice}</span>
          <input
            type="number"
            step="1"
            min={0}
            value={productModal.draft.wholesalePrice ?? 0}
            onChange={(event: any)=>
              setProductModal({
                ...productModal,
                draft: {
                  ...productModal.draft,
                  wholesalePrice: Math.max(0, Number(event.target.value) || 0),
                },
              })
            }
          />
          <small>{copy.wholesalePriceHelp}</small>
        </label>
        <label className="admin-field">
          <span>{copy.minStockLevel}</span>
          <input
            type="number"
            step="1"
            min={0}
            value={productModal.draft.minStockLevel ?? 0}
            onChange={(event: any)=>
              setProductModal({
                ...productModal,
                draft: {
                  ...productModal.draft,
                  minStockLevel: Math.max(0, Number(event.target.value) || 0),
                },
              })
            }
          />
        </label>
        <label className="admin-field">
          <span>{copy.badge}</span>
          <input
            value={productModal.draft.badge ?? ""}
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
              setProductModal({
                ...productModal,
                draft: { ...productModal.draft, description: event.target.value },
              })
            }
          />
        </label>
        <div className="admin-field admin-field-wide">
          <span>{copy.ingredientsLabel}</span>
          <div className="admin-ingredients-list">
            {(productModal.draft.ingredients ?? "")
              .split(",")
              .map((s: any)=> s.trim())
              .filter(Boolean)
              .map((ingredient: any, iIdx: any, arr: any)=> (
                <div key={iIdx} className="admin-ingredient-tag">
                  <span>{ingredient}</span>
                  <button
                    type="button"
                    className="admin-ingredient-remove"
                    onClick={() => {
                      const next = arr.filter((_: any, i: any)=> i !== iIdx).join(", ");
                      setProductModal({
                        ...productModal,
                        draft: { ...productModal.draft, ingredients: next || undefined },
                      });
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            <div className="admin-ingredient-add">
              <input
                placeholder={copy.ingredientPlaceholder}
                onKeyDown={(event: any)=> {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const val = event.currentTarget.value.trim();
                    if (!val) return;
                    const existing = (productModal.draft.ingredients ?? "")
                      .split(",")
                      .map((s: any)=> s.trim())
                      .filter(Boolean);
                    existing.push(val);
                    setProductModal({
                      ...productModal,
                      draft: { ...productModal.draft, ingredients: existing.join(", ") },
                    });
                    event.currentTarget.value = "";
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={(event: any)=> {
                  const input = (event.currentTarget.previousElementSibling as HTMLInputElement);
                  const val = input.value.trim();
                  if (!val) return;
                  const existing = (productModal.draft.ingredients ?? "")
                    .split(",")
                    .map((s: any)=> s.trim())
                    .filter(Boolean);
                  existing.push(val);
                  setProductModal({
                    ...productModal,
                    draft: { ...productModal.draft, ingredients: existing.join(", ") },
                  });
                  input.value = "";
                  input.focus();
                }}
              >
                <Plus size={14} /> {copy.addIngredient}
              </button>
            </div>
          </div>
        </div>
        <label className="admin-field admin-field-wide">
          <span>{copy.usageLabel}</span>
          <textarea
            rows={4}
            value={productModal.draft.usage ?? ""}
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
              onChange={(event: any)=>
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
            {(productModal.draft.variants ?? []).length > 0 && (
              <div className="admin-variant-row admin-variant-header">
                <span>{copy.variantName}</span>
                <span>{copy.variantPrice}</span>
                <span>{copy.stockRemaining}</span>
                <span>{copy.soldCount}</span>
                <span></span>
              </div>
            )}
            {(productModal.draft.variants ?? []).map((variant: any, vIndex: any)=> (
              <div key={vIndex} className="admin-variant-row">
                <input
                  placeholder={copy.variantName}
                  value={variant.name}
                  onChange={(event: any)=> {
                    const next = [...(productModal.draft.variants ?? [])];
                    next[vIndex] = { ...next[vIndex], name: event.target.value };
                    setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                  }}
                />
                <input
                  type="number"
                  placeholder={copy.variantPrice}
                  value={variant.price || ""}
                  onChange={(event: any)=> {
                    const next = [...(productModal.draft.variants ?? [])];
                    next[vIndex] = { ...next[vIndex], price: Number(event.target.value) || 0 };
                    setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                  }}
                />
                <input
                  type="number"
                  placeholder={copy.stockRemaining}
                  value={Math.max(0, (variant.quantity || 0) - (variant.soldCount ?? 0))}
                  onChange={(event: any)=> {
                    const next = [...(productModal.draft.variants ?? [])];
                    const nextRemaining = Number(event.target.value) || 0;
                    const currentSold = next[vIndex].soldCount ?? 0;
                    next[vIndex] = { ...next[vIndex], quantity: nextRemaining + currentSold };
                    setProductModal({ ...productModal, draft: { ...productModal.draft, variants: next } });
                  }}
                />
                {/* Sales counter: shown so the remaining figure above can be read against
                    it, never editable. Only a sale moves it, and a wrong one is repaired
                    through the recount action on the products table. */}
                <input
                  type="number"
                  placeholder={copy.soldCount}
                  value={variant.soldCount ?? 0}
                  readOnly
                  title={language === "MN" ? "Зарагдсан тоо зөвхөн борлуулалтаар өөрчлөгдөнө. Засах бол жагсаалтын \"Тооллого\" товчийг ашиглана уу." : "The sold counter only moves with a sale. Use the recount action on the products table to correct it."}
                  className="admin-input-readonly"
                />
                <button
                  type="button"
                  className="admin-icon-btn"
                  onClick={() => {
                    const next = (productModal.draft.variants ?? []).filter((_: any, i: any)=> i !== vIndex);
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
          const variantRemainingTotal = hasVariants
            ? (productModal.draft.variants ?? []).reduce(
                (sum: any, v: any)=> sum + Math.max(0, (v.quantity || 0) - (v.soldCount ?? 0)),
                0,
              )
            : 0;
          const sold = productModal.draft.soldCount ?? 0;
          const remaining = hasVariants
            ? variantRemainingTotal
            : Math.max(0, (productModal.draft.totalStock ?? 0) - sold);
          return (
            <div className="admin-field admin-field-wide">
              <span>{copy.stockRemaining} - {copy.soldCount}</span>
              <div className="admin-stock-row">
                {hasVariants ? (
                  <div className="admin-stock-remaining">
                    <small>{copy.stockRemaining}</small>
                    <strong>{remaining}</strong>
                  </div>
                ) : (
                  <label className="admin-field">
                    <small>{copy.stockRemaining}</small>
                    <input
                      type="number"
                      value={remaining}
                      onChange={(event: any)=> {
                        const nextRemaining = Number(event.target.value) || 0;
                        setProductModal({
                          ...productModal,
                          draft: { ...productModal.draft, totalStock: nextRemaining + sold },
                        });
                      }}
                    />
                  </label>
                )}
                <label className="admin-field">
                  <small>{copy.soldCount}</small>
                  <input type="number" value={sold} readOnly className="admin-input-readonly" />
                </label>
              </div>
              <small className="admin-field-hint">
                {language === "MN"
                  ? "Зарагдсан тоог зөвхөн борлуулалт хөдөлгөнө. Буруу байвал жагсаалтын мөрөн дэх \"Тооллого\" товчоор засна."
                  : "The sold counter only moves with a sale. Correct a wrong one with the recount action on the products table."}
              </small>
            </div>
          );
        })()}
        <div className="admin-field admin-field-wide">
          <span>{copy.productImages}</span>
          <small>{copy.productImagesHelp}</small>
          <div className="admin-product-images">
            {productModal.draft.images.map((image: any, index: any)=>
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
                  onChange={(event: any)=> {
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
      onSubmit={(event: any)=> {
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
      onSubmit={(event: any)=> {
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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
            onChange={(event: any)=>
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

{packagingModal && (
  <AdminModal
    title={packagingModal.mode === "create" ? copy.packagingModalCreate : copy.packagingModalEdit}
    onClose={() => setPackagingModal(null)}
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        await savePackaging(packagingModal.draft);
        setPackagingModal(null);
      }}
    >
      <label className="admin-field admin-field-wide">
        <span>{copy.packagingName}</span>
        <input
          value={packagingModal.draft.name}
          onChange={(e: any)=>
            setPackagingModal({ ...packagingModal, draft: { ...packagingModal.draft, name: e.target.value } })
          }
          required
        />
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.packagingSize}</span>
        <input
          value={packagingModal.draft.size}
          onChange={(e: any)=>
            setPackagingModal({ ...packagingModal, draft: { ...packagingModal.draft, size: e.target.value } })
          }
        />
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.packagingRemaining}</span>
        <input
          type="number"
          value={packagingModal.draft.remaining}
          onChange={(e: any)=>
            setPackagingModal({ ...packagingModal, draft: { ...packagingModal.draft, remaining: Number(e.target.value) || 0 } })
          }
        />
      </label>
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setPackagingModal(null)}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary">{copy.save}</button>
      </div>
    </form>
  </AdminModal>
)}

{rawMaterialModal && (
  <AdminModal
    title={rawMaterialModal.mode === "create" ? copy.rawMaterialModalCreate : copy.rawMaterialModalEdit}
    onClose={() => setRawMaterialModal(null)}
    disableClose={rawMaterialSaving}
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setRawMaterialSaving(true);
        setRawMaterialError(null);
        try {
          await saveRawMaterial(rawMaterialModal.draft);
          setRawMaterialModal(null);
        } catch (err) {
          setRawMaterialError(err instanceof Error ? err.message : String(err));
        } finally {
          setRawMaterialSaving(false);
        }
      }}
    >
      <label className="admin-field admin-field-wide">
        <span>{copy.rawMaterialName}</span>
        <input
          value={rawMaterialModal.draft.name}
          onChange={(e: any)=>
            setRawMaterialModal({ ...rawMaterialModal, draft: { ...rawMaterialModal.draft, name: e.target.value } })
          }
          required
        />
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.rawMaterialCategory}</span>
        <select
          value={rawMaterialModal.draft.category}
          onChange={(e: any)=>
            setRawMaterialModal({
              ...rawMaterialModal,
              draft: { ...rawMaterialModal.draft, category: e.target.value as RawMaterialCategory },
            })
          }
        >
          <option value="oil">{copy.rawMaterialCategoryOil}</option>
          <option value="lye">{copy.rawMaterialCategoryLye}</option>
          <option value="fragrance">{copy.rawMaterialCategoryFragrance}</option>
          <option value="colorant">{copy.rawMaterialCategoryColorant}</option>
          <option value="additive">{copy.rawMaterialCategoryAdditive}</option>
          <option value="other">{copy.rawMaterialCategoryOther}</option>
        </select>
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialUnit}</span>
        <input
          value={rawMaterialModal.draft.unit}
          onChange={(e: any)=>
            setRawMaterialModal({ ...rawMaterialModal, draft: { ...rawMaterialModal.draft, unit: e.target.value } })
          }
          placeholder="g, ml, kg..."
          required
        />
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialRemaining}</span>
        <input
          type="number"
          min="0"
          value={rawMaterialModal.draft.remaining}
          onChange={(e: any)=>
            setRawMaterialModal({
              ...rawMaterialModal,
              draft: { ...rawMaterialModal.draft, remaining: Number(e.target.value) || 0 },
            })
          }
        />
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialUnitCost}</span>
        <input
          type="number"
          min="0"
          value={rawMaterialModal.draft.unitCost ?? ""}
          onChange={(e: any)=>
            setRawMaterialModal({
              ...rawMaterialModal,
              draft: {
                ...rawMaterialModal.draft,
                unitCost: e.target.value === "" ? null : Number(e.target.value),
              },
            })
          }
        />
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.rawMaterialNotes}</span>
        <textarea
          rows={2}
          value={rawMaterialModal.draft.notes}
          onChange={(e: any)=>
            setRawMaterialModal({ ...rawMaterialModal, draft: { ...rawMaterialModal.draft, notes: e.target.value } })
          }
        />
      </label>
      {rawMaterialError && <div className="admin-modal-error">{rawMaterialError}</div>}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setRawMaterialModal(null)} disabled={rawMaterialSaving}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={rawMaterialSaving}>{copy.save}</button>
      </div>
    </form>
  </AdminModal>
)}

{rawMaterialPurchaseModal && (
  <AdminModal
    title={`${copy.rawMaterialPurchaseModalTitle} — ${rawMaterialPurchaseModal.rawMaterialName}`}
    onClose={() => setRawMaterialPurchaseModal(null)}
    disableClose={rawMaterialPurchaseSaving}
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if (!rawMaterialPurchaseModal) return;
        const { draft } = rawMaterialPurchaseModal;
        if (!draft.quantity || draft.quantity <= 0) return;
        setRawMaterialPurchaseSaving(true);
        setRawMaterialPurchaseError(null);
        try {
          await addRawMaterialPurchase(rawMaterialPurchaseModal.rawMaterialId, {
            quantity: draft.quantity,
            unitCost: draft.unitCost,
            supplier: draft.supplier,
            purchasedAt: draft.purchasedAt,
            notes: draft.notes,
            createdByUid: user?.uid ?? "",
            paymentMethod: draft.paymentMethod ?? "cash",
          });
          setRawMaterialPurchaseModal(null);
        } catch (err) {
          setRawMaterialPurchaseError(err instanceof Error ? err.message : String(err));
        } finally {
          setRawMaterialPurchaseSaving(false);
        }
      }}
    >
      <label className="admin-field">
        <span>{copy.rawMaterialPurchasedAt}</span>
        <input
          type="date"
          required
          value={rawMaterialPurchaseModal.draft.purchasedAt}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: { ...rawMaterialPurchaseModal.draft, purchasedAt: e.target.value },
            })
          }
        />
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialPurchaseQty} ({rawMaterialPurchaseModal.unit})</span>
        <input
          type="number"
          min="0.001"
          step="any"
          required
          value={rawMaterialPurchaseModal.draft.quantity || ""}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: { ...rawMaterialPurchaseModal.draft, quantity: Number(e.target.value) || 0 },
            })
          }
        />
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialPurchaseUnitCost}</span>
        <input
          type="number"
          min="0"
          step="any"
          value={rawMaterialPurchaseModal.draft.unitCost ?? ""}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: {
                ...rawMaterialPurchaseModal.draft,
                unitCost: e.target.value === "" ? null : Number(e.target.value),
              },
            })
          }
        />
      </label>
      <label className="admin-field">
        <span>{copy.rawMaterialPurchasePaymentMethod}</span>
        <select
          value={rawMaterialPurchaseModal.draft.paymentMethod ?? "cash"}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: { ...rawMaterialPurchaseModal.draft, paymentMethod: e.target.value },
            })
          }
        >
          <option value="cash">{language === "MN" ? "Касс" : "Cash"}</option>
          <option value="bank_transfer">{language === "MN" ? "Банк" : "Bank"}</option>
        </select>
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.rawMaterialPurchaseSupplier}</span>
        <input
          value={rawMaterialPurchaseModal.draft.supplier}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: { ...rawMaterialPurchaseModal.draft, supplier: e.target.value },
            })
          }
        />
      </label>
      <label className="admin-field admin-field-wide">
        <span>{copy.rawMaterialPurchaseNotes}</span>
        <textarea
          rows={2}
          value={rawMaterialPurchaseModal.draft.notes}
          onChange={(e: any) =>
            setRawMaterialPurchaseModal({
              ...rawMaterialPurchaseModal,
              draft: { ...rawMaterialPurchaseModal.draft, notes: e.target.value },
            })
          }
        />
      </label>
      {rawMaterialPurchaseError && <div className="admin-modal-error">{rawMaterialPurchaseError}</div>}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setRawMaterialPurchaseModal(null)} disabled={rawMaterialPurchaseSaving}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={rawMaterialPurchaseSaving}>{copy.save}</button>
      </div>
    </form>
  </AdminModal>
)}

{productionBatchModal && (() => {
  const batchDraft = productionBatchModal.draft;
  const batchEditable =
    productionBatchModal.mode === "create" || productionBatchModal.previous?.status === "planning";
  const batchProduct = products.find((p: any) => p.id === batchDraft.productId);
  const batchVariants = (batchProduct?.variants ?? []) as Array<{ name: string }>;
  const rawMaterialIndex = new Map(
    (rawMaterials as any[]).map((r: any) => [r.id, { name: r.name, unit: r.unit, unitCost: r.unitCost }]),
  );
  const matchedRecipe = findRecipeFor(
    (productionRecipes ?? []) as any[],
    batchDraft.productId,
    batchDraft.plannedVariant,
  );

  /**
   * Applies a draft change and, whenever a recipe covers the product/variant,
   * recomputes the supply lines for the planned quantity.
   */
  const patchBatchDraft = (patch: any, { recalc = true }: { recalc?: boolean } = {}) => {
    const nextDraft = { ...batchDraft, ...patch };
    if (recalc && batchEditable) {
      const recipe = findRecipeFor(
        (productionRecipes ?? []) as any[],
        nextDraft.productId,
        nextDraft.plannedVariant,
      );
      if (recipe) {
        const supplies = buildSuppliesFromRecipe(recipe, nextDraft.plannedQuantity, rawMaterialIndex);
        nextDraft.supplies = supplies;
        nextDraft.totalCost = calculateSuppliesCost(supplies);
      }
    }
    setProductionBatchModal({ ...productionBatchModal, draft: nextDraft });
  };

  return (
  <AdminModal
    title={productionBatchModal.mode === "create" ? copy.productionBatchModalCreate : copy.productionBatchModalEdit}
    onClose={() => setProductionBatchModal(null)}
    disableClose={productionBatchSaving}
    wide
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if (!productionBatchModal) return;
        const draft = productionBatchModal.draft;
        if (draft.supplies.length === 0 && productionBatchModal.mode === "create") {
          setProductionBatchError(copy.productionBatchEmptySupplies);
          return;
        }
        setProductionBatchSaving(true);
        setProductionBatchError(null);
        try {
          const selectedProduct = products.find((p: any)=> p.id === draft.productId);
          const productName = selectedProduct ? selectedProduct.name : draft.productName;
          if (productionBatchModal.mode === "create") {
            await createProductionBatch({
              productId: draft.productId,
              productName,
              plannedQuantity: draft.plannedQuantity,
              expectedReadyAt: draft.expectedReadyAt,
              plannedVariant: draft.plannedVariant ?? null,
              supplies: draft.supplies,
              totalCost: draft.totalCost,
              notes: draft.notes,
              createdByUid: user?.uid ?? "",
            });
          } else if (productionBatchModal.previous) {
            await updateProductionBatch(draft.id, productionBatchModal.previous, {
              productId: draft.productId,
              productName,
              plannedQuantity: draft.plannedQuantity,
              expectedReadyAt: draft.expectedReadyAt,
              startedAt: draft.startedAt,
              readyAt: draft.readyAt,
              plannedVariant: draft.plannedVariant ?? null,
              supplies: draft.supplies,
              totalCost: draft.totalCost,
              notes: draft.notes,
            });
          }
          setProductionBatchModal(null);
        } catch (err) {
          setProductionBatchError(err instanceof Error ? err.message : String(err));
        } finally {
          setProductionBatchSaving(false);
        }
      }}
    >
      {productionBatchModal.draft.batchCode && (
        <div className="admin-field admin-field-wide">
          <span>{copy.productionBatchCode}</span>
          <strong>{productionBatchModal.draft.batchCode}</strong>
        </div>
      )}
      <label className="admin-field admin-field-wide">
        <span>{copy.productionBatchProduct}</span>
        <select
          value={productionBatchModal.draft.productId}
          disabled={!batchEditable}
          onChange={(e: any)=> {
            const pid = Number(e.target.value);
            const selected = products.find((p: any)=> p.id === pid);
            patchBatchDraft({
              productId: pid,
              productName: selected ? selected.name : "",
              plannedVariant: selected?.variants?.[0]?.name ?? null,
            });
          }}
          required
        >
          <option value={0} disabled>—</option>
          {products.map((p: any)=> (
            <option key={p.id} value={p.id}>{getProductLabel(p.id, p.name)}</option>
          ))}
        </select>
      </label>
      {batchVariants.length > 0 && (
        <label className="admin-field">
          <span>{copy.productionBatchVariant}</span>
          <select
            value={productionBatchModal.draft.plannedVariant ?? ""}
            disabled={!batchEditable}
            onChange={(e: any)=> patchBatchDraft({ plannedVariant: e.target.value || null })}
            required
          >
            <option value="" disabled>—</option>
            {batchVariants.map((v) => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        </label>
      )}
      <label className="admin-field">
        <span>{copy.productionBatchPlannedQty}</span>
        <input
          type="number"
          min="1"
          value={productionBatchModal.draft.plannedQuantity}
          disabled={!batchEditable}
          onChange={(e: any)=> patchBatchDraft({ plannedQuantity: Number(e.target.value) || 0 })}
          required
        />
      </label>
      <label className="admin-field">
        <span>{copy.productionBatchExpectedReadyAt}</span>
        <input
          type="date"
          value={productionBatchModal.draft.expectedReadyAt ?? ""}
          onChange={(e: any)=>
            patchBatchDraft({ expectedReadyAt: e.target.value || null }, { recalc: false })
          }
        />
      </label>
      <p className="admin-field-hint" style={{ gridColumn: "1 / -1", color: "#64748b", fontSize: "0.8rem" }}>
        {copy.productionBatchCuringHint}
      </p>

      {batchEditable && (
        <div
          className="admin-field admin-field-wide"
          style={{
            background: matchedRecipe ? "#ecfdf5" : "#fffbeb",
            border: `1px solid ${matchedRecipe ? "#a7f3d0" : "#fde68a"}`,
            borderRadius: 8,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.82rem", color: matchedRecipe ? "#047857" : "#b45309" }}>
            {matchedRecipe ? copy.productionBatchRecipeApplied : copy.productionBatchRecipeMissing}
          </span>
          {matchedRecipe && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => patchBatchDraft({})}
            >
              {copy.productionBatchRecipeRecalc}
            </button>
          )}
        </div>
      )}

      <div className="admin-field admin-field-wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <strong>{copy.productionBatchSupplies}</strong>
          {batchEditable && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                const firstRm = rawMaterials[0];
                if (!firstRm) return;
                const nextSupplies = [
                  ...productionBatchModal.draft.supplies,
                  {
                    rawMaterialId: firstRm.id,
                    rawMaterialName: firstRm.name,
                    quantity: 0,
                    unit: firstRm.unit,
                    unitCost: firstRm.unitCost,
                  },
                ];
                const calcTotalCost = (sups: any[]) =>
                  sups.reduce((s: number, sup: any) =>
                    sup.unitCost != null ? s + sup.quantity * sup.unitCost : s, 0);
                setProductionBatchModal({
                  ...productionBatchModal,
                  draft: {
                    ...productionBatchModal.draft,
                    supplies: nextSupplies,
                    totalCost: calcTotalCost(nextSupplies),
                  },
                });
              }}
            >
              <Plus size={14} /> {copy.productionBatchAddSupply}
            </button>
          )}
        </div>
        {(() => {
          const editableSupply = productionBatchModal.mode === "create" || productionBatchModal.previous?.status === "planning";
          const calcTotalCost = (sups: any[]) =>
            sups.reduce((s: number, sup: any) =>
              sup.unitCost != null ? s + sup.quantity * sup.unitCost : s, 0);
          const computedTotal = calcTotalCost(productionBatchModal.draft.supplies);
          return productionBatchModal.draft.supplies.length === 0 ? (
            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{copy.productionBatchEmptySupplies}</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left",  padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>Материал</th>
                    <th style={{ textAlign: "right", padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>Хэмжээ</th>
                    <th style={{ textAlign: "left",  padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>Нэгж</th>
                    <th style={{ textAlign: "right", padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>Үлдэгдэл</th>
                    <th style={{ textAlign: "right", padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>Нэгж үнэ</th>
                    <th style={{ textAlign: "right", padding: "4px 0   6px 0", color: "#6b7280", fontWeight: 500 }}>Нийлбэр</th>
                    {editableSupply && <th style={{ width: 36 }} />}
                  </tr>
                </thead>
                <tbody>
                  {productionBatchModal.draft.supplies.map((supply: any, idx: any) => {
                    const rm = rawMaterials.find((r: any) => r.id === supply.rawMaterialId);
                    const remaining = rm ? rm.remaining : null;
                    const lineTotal = supply.unitCost != null ? supply.quantity * supply.unitCost : null;
                    const lowStock = remaining !== null && remaining < supply.quantity;
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "5px 8px 5px 0" }}>
                          <select
                            value={supply.rawMaterialId}
                            disabled={!editableSupply}
                            style={{ width: "100%" }}
                            onChange={(e: any) => {
                              const rmId = Number(e.target.value);
                              const newRm = rawMaterials.find((r: any) => r.id === rmId);
                              if (!newRm) return;
                              const nextSupplies = [...productionBatchModal.draft.supplies];
                              nextSupplies[idx] = {
                                rawMaterialId: newRm.id,
                                rawMaterialName: newRm.name,
                                quantity: supply.quantity,
                                unit: newRm.unit,
                                unitCost: newRm.unitCost,
                              };
                              setProductionBatchModal({
                                ...productionBatchModal,
                                draft: { ...productionBatchModal.draft, supplies: nextSupplies, totalCost: calcTotalCost(nextSupplies) },
                              });
                            }}
                          >
                            {rawMaterials.map((r: any) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "5px 8px 5px 0" }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={supply.quantity}
                            disabled={!editableSupply}
                            style={{ width: "100%", textAlign: "right" }}
                            onChange={(e: any) => {
                              const nextSupplies = [...productionBatchModal.draft.supplies];
                              nextSupplies[idx] = { ...supply, quantity: Number(e.target.value) || 0 };
                              setProductionBatchModal({
                                ...productionBatchModal,
                                draft: { ...productionBatchModal.draft, supplies: nextSupplies, totalCost: calcTotalCost(nextSupplies) },
                              });
                            }}
                          />
                        </td>
                        <td style={{ padding: "5px 8px 5px 0", color: "#64748b", whiteSpace: "nowrap" }}>{supply.unit}</td>
                        <td style={{ padding: "5px 8px 5px 0", textAlign: "right", color: lowStock ? "#dc2626" : "#6b7280", fontWeight: lowStock ? 600 : 400 }}>
                          {remaining !== null ? remaining.toLocaleString() : "—"}
                        </td>
                        <td style={{ padding: "5px 8px 5px 0", textAlign: "right", color: "#6b7280" }}>
                          {supply.unitCost != null ? supply.unitCost.toLocaleString() : "—"}
                        </td>
                        <td style={{ padding: "5px 0 5px 0", textAlign: "right", fontWeight: 500, color: "#374151" }}>
                          {lineTotal !== null ? lineTotal.toLocaleString() : "—"}
                        </td>
                        {editableSupply && (
                          <td style={{ padding: "5px 0 5px 8px", textAlign: "right" }}>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              onClick={() => {
                                const nextSupplies = productionBatchModal.draft.supplies.filter((_: any, i: any) => i !== idx);
                                setProductionBatchModal({
                                  ...productionBatchModal,
                                  draft: { ...productionBatchModal.draft, supplies: nextSupplies, totalCost: calcTotalCost(nextSupplies) },
                                });
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                    <td colSpan={5} style={{ paddingTop: 8, textAlign: "right", fontWeight: 600, color: "#374151", fontSize: "0.82rem" }}>Нийт өртөг:</td>
                    <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 700, color: "#111827" }}>
                      {computedTotal > 0 ? computedTotal.toLocaleString() : "—"}
                    </td>
                    {editableSupply && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })()}
      </div>
      <label className="admin-field admin-field-wide">
        <span>{copy.productionBatchNotes}</span>
        <textarea
          rows={2}
          value={productionBatchModal.draft.notes}
          onChange={(e: any)=>
            setProductionBatchModal({
              ...productionBatchModal,
              draft: { ...productionBatchModal.draft, notes: e.target.value },
            })
          }
        />
      </label>
      {productionBatchError && <div className="admin-modal-error">{productionBatchError}</div>}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setProductionBatchModal(null)} disabled={productionBatchSaving}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={productionBatchSaving}>{copy.save}</button>
      </div>
    </form>
  </AdminModal>
  );
})()}

{productionAdvanceModal && (
  <AdminModal
    title={copy.productionAdvanceTitle}
    onClose={() => setProductionAdvanceModal(null)}
    disableClose={productionAdvanceSaving}
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if (!productionAdvanceModal) return;
        setProductionAdvanceSaving(true);
        setProductionAdvanceError(null);
        try {
          const { batch, targetStatus, startedAt, expectedReadyAt, readyAt, actualQuantity, variantName } = productionAdvanceModal;
          await advanceProductionBatch(batch.id, batch, targetStatus, {
            startedAt: startedAt || null,
            expectedReadyAt: expectedReadyAt || null,
            readyAt: readyAt || null,
            actualQuantity,
            variantName: variantName || null,
          });
          setProductionAdvanceModal(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith("INSUFFICIENT:")) {
            setProductionAdvanceError(`${copy.productionAdvanceInsufficient} ${msg.slice("INSUFFICIENT:".length)}`);
          } else if (msg === "VARIANT_REQUIRED") {
            setProductionAdvanceError(language === "MN" ? "Variant сонгоно уу." : "Please select a variant.");
          } else if (msg === "VARIANT_NOT_FOUND") {
            setProductionAdvanceError(language === "MN" ? "Сонгосон variant олдсонгүй." : "Selected variant not found.");
          } else {
            setProductionAdvanceError(msg);
          }
        } finally {
          setProductionAdvanceSaving(false);
        }
      }}
    >
      {productionAdvanceModal.targetStatus === "curing" && (
        <>
          <p style={{ marginBottom: "0.75rem" }}>{copy.productionAdvanceConfirmStart}</p>
          <div className="admin-data-table-wrap" style={{ marginBottom: "0.75rem" }}>
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>{copy.rawMaterialName}</th>
                  <th>{copy.productionAdvanceRequired}</th>
                  <th>{copy.productionAdvanceAvailable}</th>
                </tr>
              </thead>
              <tbody>
                {productionAdvanceModal.batch.supplies.map((supply: any, i: any) => {
                  const rm = rawMaterials.find((r: any) => r.id === supply.rawMaterialId);
                  const available = rm ? rm.remaining : 0;
                  const insufficient = available < supply.quantity;
                  return (
                    <tr key={i}>
                      <td>{supply.rawMaterialName}</td>
                      <td>{supply.quantity} {supply.unit}</td>
                      <td style={{ color: insufficient ? "#dc2626" : undefined }}>
                        {available} {supply.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label className="admin-field admin-field-wide">
            <span>{copy.productionBatchStartedAt}</span>
            <input
              type="date"
              value={productionAdvanceModal.startedAt}
              onChange={(e: any) =>
                setProductionAdvanceModal({ ...productionAdvanceModal, startedAt: e.target.value })
              }
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{copy.productionBatchExpectedReadyAt}</span>
            <input
              type="date"
              value={productionAdvanceModal.expectedReadyAt}
              onChange={(e: any) =>
                setProductionAdvanceModal({ ...productionAdvanceModal, expectedReadyAt: e.target.value })
              }
            />
          </label>
          <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
            {copy.productionBatchCuringHint}
          </p>
        </>
      )}
      {productionAdvanceModal.targetStatus === "ready" && (() => {
        const advProduct = products.find((p: any) => p.id === productionAdvanceModal.batch.productId);
        const advVariants = (advProduct?.variants ?? []) as Array<{ name: string }>;
        return (
        <>
          <p style={{ marginBottom: "0.75rem" }}>{copy.productionAdvanceConfirmReady}</p>
          <label className="admin-field admin-field-wide">
            <span>{copy.productionAdvanceActualQtyLabel}</span>
            <input
              type="number"
              min="1"
              value={productionAdvanceModal.actualQuantity}
              onChange={(e: any)=>
                setProductionAdvanceModal({
                  ...productionAdvanceModal,
                  actualQuantity: Number(e.target.value) || 0,
                })
              }
              required
            />
          </label>
          {advVariants.length > 0 && (
            <label className="admin-field admin-field-wide">
              <span>{language === "MN" ? "Variant (нөөц нэмэгдэх)" : "Variant (stock target)"}</span>
              <select
                value={productionAdvanceModal.variantName}
                onChange={(e: any)=>
                  setProductionAdvanceModal({ ...productionAdvanceModal, variantName: e.target.value })
                }
                required
              >
                <option value="" disabled>—</option>
                {advVariants.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="admin-field admin-field-wide">
            <span>{copy.productionBatchReadyAt}</span>
            <input
              type="date"
              value={productionAdvanceModal.readyAt}
              onChange={(e: any)=>
                setProductionAdvanceModal({ ...productionAdvanceModal, readyAt: e.target.value })
              }
            />
          </label>
        </>
        );
      })()}
      {productionAdvanceError && <div className="admin-modal-error">{productionAdvanceError}</div>}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setProductionAdvanceModal(null)} disabled={productionAdvanceSaving}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={productionAdvanceSaving}>
          {productionAdvanceModal.targetStatus === "curing"
            ? copy.productionAdvanceStart
            : copy.productionAdvanceReady}
        </button>
      </div>
    </form>
  </AdminModal>
)}

{productionRecipeModal && (() => {
  const recipeDraft = productionRecipeModal.draft;
  const recipeCategories = ((collections ?? []) as any[]).filter((c: any) =>
    (products as any[]).some((p: any) => p.category === c.slug),
  );
  const productsInCategory = (products as any[]).filter(
    (p: any) => !recipeDraft.category || p.category === recipeDraft.category,
  );
  const recipeProduct = (products as any[]).find((p: any) => p.id === recipeDraft.productId);
  const recipeVariants = (recipeProduct?.variants ?? []) as Array<{ name: string }>;

  const recipeCost = (sups: any[]) =>
    sups.reduce((s: number, sup: any) => (sup.unitCost != null ? s + sup.quantity * sup.unitCost : s), 0);

  const patchRecipeDraft = (patch: any) =>
    setProductionRecipeModal({
      ...productionRecipeModal,
      draft: { ...recipeDraft, ...patch },
    });

  const setRecipeSupplies = (supplies: any[]) =>
    patchRecipeDraft({ supplies, totalCost: recipeCost(supplies) });

  const computedRecipeTotal = recipeCost(recipeDraft.supplies);
  const recipeBase = recipeDraft.baseQuantity > 0 ? recipeDraft.baseQuantity : 1;

  return (
  <AdminModal
    title={productionRecipeModal.mode === "create" ? copy.recipeModalCreate : copy.recipeModalEdit}
    onClose={() => setProductionRecipeModal(null)}
    disableClose={productionRecipeSaving}
    wide
  >
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const draft = productionRecipeModal.draft;
        if (draft.supplies.length === 0) {
          setProductionRecipeError(copy.recipeEmptySupplies);
          return;
        }
        if (draft.baseQuantity <= 0) {
          setProductionRecipeError(copy.recipeBaseQuantityHint);
          return;
        }
        const duplicate = ((productionRecipes ?? []) as any[]).some(
          (r: any) =>
            r.id !== draft.id &&
            r.productId === draft.productId &&
            (r.variantName ?? null) === (draft.variantName ?? null),
        );
        if (duplicate) {
          setProductionRecipeError(copy.recipeDuplicate);
          return;
        }
        setProductionRecipeSaving(true);
        setProductionRecipeError(null);
        try {
          const selected = (products as any[]).find((p: any) => p.id === draft.productId);
          const payload = {
            productId: draft.productId,
            productName: selected ? selected.name : draft.productName,
            category: selected ? selected.category : draft.category,
            variantName: draft.variantName ?? null,
            baseQuantity: draft.baseQuantity,
            supplies: draft.supplies,
            totalCost: recipeCost(draft.supplies),
            notes: draft.notes,
          };
          if (productionRecipeModal.mode === "create") {
            await createProductionRecipe({ ...payload, createdByUid: user?.uid ?? "" });
          } else {
            await updateProductionRecipe(draft.id, payload);
          }
          setProductionRecipeModal(null);
        } catch (err) {
          setProductionRecipeError(err instanceof Error ? err.message : String(err));
        } finally {
          setProductionRecipeSaving(false);
        }
      }}
    >
      <label className="admin-field">
        <span>{copy.recipeCategory}</span>
        <select
          value={recipeDraft.category ?? ""}
          onChange={(e: any) => {
            const slug = e.target.value;
            const firstInCategory = (products as any[]).find((p: any) => !slug || p.category === slug);
            patchRecipeDraft({
              category: slug,
              productId: firstInCategory ? firstInCategory.id : 0,
              productName: firstInCategory ? firstInCategory.name : "",
              variantName: firstInCategory?.variants?.[0]?.name ?? null,
            });
          }}
        >
          <option value="">{copy.allCategories}</option>
          {recipeCategories.map((c: any) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        <span>{copy.recipeProduct}</span>
        <select
          value={recipeDraft.productId}
          onChange={(e: any) => {
            const pid = Number(e.target.value);
            const selected = (products as any[]).find((p: any) => p.id === pid);
            patchRecipeDraft({
              productId: pid,
              productName: selected ? selected.name : "",
              category: selected ? selected.category : recipeDraft.category,
              variantName: selected?.variants?.[0]?.name ?? null,
            });
          }}
          required
        >
          <option value={0} disabled>—</option>
          {productsInCategory.map((p: any) => (
            <option key={p.id} value={p.id}>{getProductLabel(p.id, p.name)}</option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        <span>{copy.recipeVariant}</span>
        <select
          value={recipeDraft.variantName ?? ""}
          disabled={recipeVariants.length === 0}
          onChange={(e: any) => patchRecipeDraft({ variantName: e.target.value || null })}
        >
          <option value="">{copy.recipeVariantAll}</option>
          {recipeVariants.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        <span>{copy.recipeBaseQuantity}</span>
        <input
          type="number"
          min="1"
          step="any"
          value={recipeDraft.baseQuantity}
          onChange={(e: any) => patchRecipeDraft({ baseQuantity: Number(e.target.value) || 0 })}
          required
        />
      </label>
      <p className="admin-field-hint" style={{ gridColumn: "1 / -1", color: "#64748b", fontSize: "0.8rem" }}>
        {copy.recipeBaseQuantityHint}
      </p>

      <div className="admin-field admin-field-wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <strong>{copy.recipeSupplies}</strong>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              const firstRm = (rawMaterials as any[])[0];
              if (!firstRm) return;
              setRecipeSupplies([
                ...recipeDraft.supplies,
                {
                  rawMaterialId: firstRm.id,
                  rawMaterialName: firstRm.name,
                  quantity: 0,
                  unit: firstRm.unit,
                  unitCost: firstRm.unitCost,
                },
              ]);
            }}
          >
            <Plus size={14} /> {copy.recipeAddSupply}
          </button>
        </div>
        {recipeDraft.supplies.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{copy.recipeEmptySupplies}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left",  padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.rawMaterialName}</th>
                  <th style={{ textAlign: "right", padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.packagingRemaining}</th>
                  <th style={{ textAlign: "left",  padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.rawMaterialUnit}</th>
                  <th style={{ textAlign: "right", padding: "4px 8px 6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.rawMaterialUnitCost}</th>
                  <th style={{ textAlign: "right", padding: "4px 0   6px 0", color: "#6b7280", fontWeight: 500 }}>{copy.recipeTotalCost}</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {recipeDraft.supplies.map((supply: any, idx: number) => {
                  const lineTotal = supply.unitCost != null ? supply.quantity * supply.unitCost : null;
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "5px 8px 5px 0" }}>
                        <select
                          value={supply.rawMaterialId}
                          style={{ width: "100%" }}
                          onChange={(e: any) => {
                            const rmId = Number(e.target.value);
                            const newRm = (rawMaterials as any[]).find((r: any) => r.id === rmId);
                            if (!newRm) return;
                            const next = [...recipeDraft.supplies];
                            next[idx] = {
                              rawMaterialId: newRm.id,
                              rawMaterialName: newRm.name,
                              quantity: supply.quantity,
                              unit: newRm.unit,
                              unitCost: newRm.unitCost,
                            };
                            setRecipeSupplies(next);
                          }}
                        >
                          {(rawMaterials as any[]).map((r: any) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "5px 8px 5px 0" }}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={supply.quantity}
                          style={{ width: "100%", textAlign: "right" }}
                          onChange={(e: any) => {
                            const next = [...recipeDraft.supplies];
                            next[idx] = { ...supply, quantity: Number(e.target.value) || 0 };
                            setRecipeSupplies(next);
                          }}
                        />
                      </td>
                      <td style={{ padding: "5px 8px 5px 0", color: "#64748b", whiteSpace: "nowrap" }}>{supply.unit}</td>
                      <td style={{ padding: "5px 8px 5px 0", textAlign: "right", color: "#6b7280" }}>
                        {supply.unitCost != null ? supply.unitCost.toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "5px 0 5px 0", textAlign: "right", fontWeight: 500, color: "#374151" }}>
                        {lineTotal !== null ? lineTotal.toLocaleString() : "—"}
                      </td>
                      <td style={{ padding: "5px 0 5px 8px", textAlign: "right" }}>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={() => setRecipeSupplies(recipeDraft.supplies.filter((_: any, i: number) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                  <td colSpan={4} style={{ paddingTop: 8, textAlign: "right", fontWeight: 600, color: "#374151", fontSize: "0.82rem" }}>
                    {copy.recipeTotalCost}:
                  </td>
                  <td style={{ paddingTop: 8, textAlign: "right", fontWeight: 700, color: "#111827" }}>
                    {computedRecipeTotal > 0 ? computedRecipeTotal.toLocaleString() : "—"}
                  </td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={4} style={{ paddingTop: 4, textAlign: "right", fontWeight: 500, color: "#6b7280", fontSize: "0.8rem" }}>
                    {copy.recipeUnitCost}:
                  </td>
                  <td style={{ paddingTop: 4, textAlign: "right", fontWeight: 600, color: "#374151", fontSize: "0.8rem" }}>
                    {computedRecipeTotal > 0 ? Math.round(computedRecipeTotal / recipeBase).toLocaleString() : "—"}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <label className="admin-field admin-field-wide">
        <span>{copy.recipeNotes}</span>
        <textarea
          rows={2}
          value={recipeDraft.notes}
          onChange={(e: any) => patchRecipeDraft({ notes: e.target.value })}
        />
      </label>
      {productionRecipeError && <div className="admin-modal-error">{productionRecipeError}</div>}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => setProductionRecipeModal(null)} disabled={productionRecipeSaving}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={productionRecipeSaving}>{copy.save}</button>
      </div>
    </form>
  </AdminModal>
  );
})()}

{customerModal && (
  <AdminModal
    title={customerModal.mode === "create" ? copy.newCustomer : copy.editCustomer}
    onClose={() => setCustomerModal(null)}
    disableClose={customerSavingState}
    wide
  >
    <form
      className="admin-modal-form"
      onSubmit={async (event: FormEvent) => {
        event.preventDefault();
        if (!customerModal) return;
        setCustomerSavingState(true);
        setCustomerError(null);
        try {
          const draft = customerModal.draft;
          const input = {
            code: draft.code,
            type: draft.type,
            name: draft.name,
            displayName: draft.displayName,
            registrationNumber: draft.registrationNumber,
            contactPerson: draft.contactPerson,
            phoneNumber: draft.phoneNumber,
            secondaryPhone: draft.secondaryPhone,
            email: draft.email,
            address: draft.address,
            note: draft.note,
            tags: draft.tags,
            status: draft.status,
          };
          if (customerModal.mode === "create") {
            await createCustomer(input);
          } else {
            await updateCustomer(draft.id, input);
          }
          setCustomerModal(null);
        } catch (err) {
          setCustomerError(err instanceof Error ? err.message : String(err));
        } finally {
          setCustomerSavingState(false);
        }
      }}
    >
      {customerError && <div className="admin-sync-error">{customerError}</div>}

      <div className="admin-form-grid">
        <label className="admin-field admin-field-wide">
          <span>{copy.customerNameLabel}</span>
          <input
            value={customerModal.draft.name}
            onChange={(event: any)=>
              setCustomerModal({
                ...customerModal,
                draft: { ...customerModal.draft, name: event.target.value },
              })
            }
            required
          />
        </label>
        <label className="admin-field">
          <span>{copy.txType}</span>
          <select
            value={customerModal.draft.type}
            onChange={(event: any)=>
              setCustomerModal({
                ...customerModal,
                draft: { ...customerModal.draft, type: event.target.value as CustomerType },
              })
            }
          >
            <option value="individual">{copy.customerTypeInd}</option>
            <option value="organization">{copy.customerTypeOrg}</option>
          </select>
        </label>
        <label className="admin-field">
          <span>{copy.customerPhone}</span>
          <input
            value={customerModal.draft.phoneNumber}
            onChange={(event: any)=>
              setCustomerModal({
                ...customerModal,
                draft: { ...customerModal.draft, phoneNumber: event.target.value },
              })
            }
            required
          />
        </label>
        <label className="admin-field admin-field-wide">
          <span>{copy.customerAddress}</span>
          <textarea
            value={customerModal.draft.address?.streetAddress ?? ""}
            rows={2}
            onChange={(event: any)=>
              setCustomerModal({
                ...customerModal,
                draft: {
                  ...customerModal.draft,
                  address: {
                    region: customerModal.draft.address?.region ?? "",
                    districtOrSoum: customerModal.draft.address?.districtOrSoum ?? "",
                    khorooOrBag: customerModal.draft.address?.khorooOrBag ?? "",
                    streetAddress: event.target.value,
                  },
                },
              })
            }
          />
        </label>
        <label className="admin-field">
          <span>{copy.active}</span>
          <select
            value={customerModal.draft.status}
            onChange={(event: any)=>
              setCustomerModal({
                ...customerModal,
                draft: {
                  ...customerModal.draft,
                  status: event.target.value as EntityStatus,
                },
              })
            }
          >
            <option value="active">{copy.active}</option>
            <option value="inactive">{copy.inactive}</option>
          </select>
        </label>
      </div>

      <div className="admin-modal-footer">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setCustomerModal(null)}
          disabled={customerSavingState}
        >
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={customerSavingState}>
          {copy.save}
        </button>
      </div>
    </form>
  </AdminModal>
)}

{crmContactModal && (() => {
  const draft = crmContactModal.draft;
  const isOrganization = draft.type === "organization";
  const address = draft.address ?? { region: "", districtOrSoum: "", khorooOrBag: "", streetAddress: "" };
  const patchDraft = (patch: any) =>
    setCrmContactModal({ ...crmContactModal, draft: { ...draft, ...patch } });
  const patchAddress = (patch: any) => patchDraft({ address: { ...address, ...patch } });

  return (
    <AdminModal
      title={crmContactModal.mode === "create" ? copy.newContact : copy.editContact}
      description={copy.contactsText}
      onClose={closeCrmContactModal}
      disableClose={savingCrmContact}
      wide
    >
      <form className="admin-modal-form" onSubmit={handleCrmContactSubmit}>
        {crmContactModalError && <div className="admin-sync-error">{crmContactModalError}</div>}

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{copy.customerCode}</span>
            <input type="text" value={draft.code} readOnly disabled />
          </label>
          <label className="admin-field">
            <span>{copy.txType}</span>
            <select
              value={draft.type}
              onChange={(event: any) => patchDraft({ type: event.target.value })}
            >
              <option value="individual">{copy.customerTypeInd}</option>
              <option value="organization">{copy.customerTypeOrg}</option>
            </select>
          </label>

          {isOrganization && (
            <>
              <label className="admin-field">
                <span>{language === "MN" ? "Байгууллагын нэр" : "Organization name"}</span>
                <input
                  type="text"
                  value={draft.organizationName}
                  onChange={(event: any) => patchDraft({ organizationName: event.target.value })}
                  required
                />
              </label>
              <label className="admin-field">
                <span>{copy.customerRegNo}</span>
                <input
                  type="text"
                  value={draft.registrationNumber}
                  onChange={(event: any) => patchDraft({ registrationNumber: event.target.value })}
                />
              </label>
            </>
          )}

          <label className="admin-field">
            <span>{isOrganization ? copy.customerContactPerson : copy.customerNameLabel}</span>
            <input
              type="text"
              value={draft.fullName}
              onChange={(event: any) => patchDraft({ fullName: event.target.value })}
              required={!isOrganization}
            />
          </label>
          <label className="admin-field">
            <span>{copy.customerPhone}</span>
            <input
              type="tel"
              value={draft.phoneNumber}
              onChange={(event: any) => patchDraft({ phoneNumber: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{copy.customerSecondaryPhone}</span>
            <input
              type="tel"
              value={draft.secondaryPhone}
              onChange={(event: any) => patchDraft({ secondaryPhone: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{copy.customerEmail}</span>
            <input
              type="email"
              value={draft.email ?? ""}
              onChange={(event: any) => patchDraft({ email: event.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>{copy.status}</span>
            <select
              value={draft.status}
              onChange={(event: any) => patchDraft({ status: event.target.value })}
            >
              <option value="active">{copy.active}</option>
              <option value="inactive">{copy.inactive}</option>
            </select>
          </label>
        </div>

        <AdminCollapsibleCard
          title={copy.customerAddress}
          note={language === "MN" ? "Сонголттой" : "Optional"}
        >
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{language === "MN" ? "Аймаг / Хот" : "Province / City"}</span>
              <select
                value={address.region}
                onChange={(event: any) =>
                  // Districts and khoroos are region-specific — reset both when the region changes.
                  patchAddress({ region: event.target.value, districtOrSoum: "", khorooOrBag: "" })
                }
              >
                <option value="">—</option>
                {getRegionOptions().map((region: string) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Дүүрэг / Сум" : "District / Soum"}</span>
              <select
                value={address.districtOrSoum}
                onChange={(event: any) =>
                  patchAddress({ districtOrSoum: event.target.value, khorooOrBag: "" })
                }
              >
                <option value="">—</option>
                {getDistrictOrSoumOptions(address.region).map((district: string) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Хороо / Баг" : "Khoroo / Bag"}</span>
              <select
                value={address.khorooOrBag}
                onChange={(event: any) => patchAddress({ khorooOrBag: event.target.value })}
                disabled={getKhorooOrBagOptions(address.region, address.districtOrSoum).length === 0}
              >
                <option value="">—</option>
                {getKhorooOrBagOptions(address.region, address.districtOrSoum).map((khoroo: string) => (
                  <option key={khoroo} value={khoroo}>
                    {khoroo}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field admin-field-wide">
              <span>{language === "MN" ? "Байр, орц, давхар, тоот" : "Street address"}</span>
              <input
                type="text"
                value={address.streetAddress}
                onChange={(event: any) => patchAddress({ streetAddress: event.target.value })}
              />
            </label>
          </div>
        </AdminCollapsibleCard>

        <label className="admin-field admin-field-wide">
          <span>{copy.customerNote}</span>
          <textarea
            rows={2}
            value={draft.note}
            onChange={(event: any) => patchDraft({ note: event.target.value })}
          />
        </label>

        <div className="admin-modal-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={closeCrmContactModal}
            disabled={savingCrmContact}
          >
            {copy.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={savingCrmContact}>
            {copy.save}
          </button>
        </div>
      </form>
    </AdminModal>
  );
})()}

{transactionModal && (
  <AdminModal
    title={
      transactionModal.mode !== "create"
        ? copy.editTransaction
        : transactionModal.draft.type === "return"
          ? (language === "MN" ? "Буцаалт бүртгэх" : "Register a return")
          : copy.newTransaction
    }
    onClose={() => setTransactionModal(null)}
    disableClose={transactionSavingState}
    xl
  >
    <form
      className="admin-modal-form"
      onSubmit={async (event: FormEvent) => {
        event.preventDefault();
        if (!transactionModal) return;
        const draft = transactionModal.draft;
        if (!draft.customerId) {
          setTransactionError(copy.selectCustomerFirst);
          return;
        }
        if (draft.items.length === 0) {
          setTransactionError(copy.addAtLeastOneItem);
          return;
        }
        // A return puts goods back on the shelf rather than taking them off, so it can never
        // be short of stock — only delivery/sale need the "enough left to hand out" check.
        for (const txItem of draft.type === "return" ? [] : draft.items) {
          const prod = products.find((p: any)=> p.id === txItem.productId);
          if (!prod) continue;
          // Without a variant the movement lands on the product-level counter alone and the
          // variant's own figure never catches up — the drift is permanent, so it is caught
          // here rather than left to the stock module to refuse mid-transaction.
          if (prod.variants?.length > 0 && !txItem.variant) {
            setTransactionError(
              language === "MN"
                ? `"${prod.name}" — хувилбарыг заавал сонгоно уу.`
                : `"${prod.name}" — pick a variant.`,
            );
            return;
          }
          let sTotal = 0;
          let sSold = 0;
          if (txItem.variant && prod.variants) {
            const sv = prod.variants.find((v: any)=> v.name === txItem.variant);
            sTotal = sv ? (sv.quantity || 0) : 0;
            sSold = sv ? (sv.soldCount ?? 0) : 0;
          } else {
            sTotal = prod.totalStock ?? 0;
            sSold = prod.soldCount ?? 0;
          }
          // When editing an existing transaction, the previous quantity for this
          // product/variant is already included in soldCount. Add it back so we
          // check against the truly available stock.
          const prevItem = (transactionModal.mode === "edit" || transactionModal.mode === "edit-limited") && transactionModal.previous
            ? transactionModal.previous.items.find(
                (pi: any)=> pi.productId === txItem.productId && pi.variant === txItem.variant
              )
            : null;
          const prevQty = prevItem ? prevItem.quantity : 0;
          const sRemaining = sTotal - sSold + prevQty;
          if (txItem.quantity > sRemaining) {
            setTransactionError(
              language === "MN"
                ? `"${prod.name}${txItem.variant ? ` (${txItem.variant})` : ""}" — үлдэгдэл ${sRemaining} ширхэг байна. ${txItem.quantity} шилжүүлэх боломжгүй.`
                : `"${prod.name}${txItem.variant ? ` (${txItem.variant})` : ""}" — only ${sRemaining} in stock. Cannot transfer ${txItem.quantity}.`,
            );
            return;
          }
        }
        setTransactionSavingState(true);
        setTransactionError(null);
        try {
          const subtotal = draft.items.reduce((s: any, i: any)=> s + i.lineTotal, 0);
          const discountType = draft.totals.discountType === "percent" ? "percent" : "amount";
          const discountValue = Math.max(0, draft.totals.discountValue ?? draft.totals.discount ?? 0);
          const discount = Math.min(
            subtotal,
            discountType === "percent"
              ? Math.round((subtotal * Math.min(100, discountValue)) / 100)
              : discountValue,
          );
          const netTotal = Math.max(0, subtotal - discount);
          // НӨАТ follows the same three modes the Sales module uses: `added` bills the tax
          // on top, `included` leaves the billed amount alone and only records how much of
          // it is tax.
          const vatMode = normalizeVatMode(draft.totals.vatMode);
          const grandTotal = netTotal + (vatMode === "added" ? calculateVat(netTotal, "added") : 0);
          // A payment can never exceed what is owed. The ledger entry clamps it too, so
          // clamping here keeps the stored record and the journal entry in agreement.
          const paidAmount = Math.min(Math.max(0, draft.payment.paidAmount), grandTotal);
          const paymentStatus: CustomerTransactionRecord["payment"]["status"] =
            paidAmount <= 0 ? "unpaid" : paidAmount >= grandTotal ? "paid" : "partial";
          const input = {
            type: draft.type,
            customerId: draft.customerId,
            customerSnapshot: draft.customerSnapshot,
            items: draft.items,
            // vatAmount is recomputed inside createCustomerTransaction from the gross
            // grandTotal, so it can never drift from what the customer is billed.
            totals: { subtotal, discount, discountType, discountValue, vatMode, grandTotal },
            payment: {
              ...draft.payment,
              paidAmount,
              status: paymentStatus,
              paidAt:
                paymentStatus === "unpaid"
                  ? null
                  : (draft.payment.paidAt ?? new Date().toISOString()),
            },
            relatedTransactionId: draft.relatedTransactionId,
            transactionDate: (() => {
              if (!draft.transactionDate) return new Date().toISOString();
              if (/^\d{4}-\d{2}-\d{2}$/.test(draft.transactionDate)) {
                const [y, m, d] = draft.transactionDate.split("-").map(Number);
                const now = new Date();
                return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
              }
              return draft.transactionDate;
            })(),
            note: draft.note,
            createdByUid: user?.uid ?? "",
          };
          if (transactionModal.mode === "create") {
            await createCustomerTransaction(input);
          } else if (transactionModal.previous) {
            await updateCustomerTransaction(draft.id, transactionModal.previous, input);
          }

          setTransactionModal(null);
        } catch (err) {
          setTransactionError(err instanceof Error ? err.message : String(err));
        } finally {
          setTransactionSavingState(false);
        }
      }}
    >
      {transactionError && <div className="admin-sync-error">{transactionError}</div>}

      <div className="admin-form-grid">
        <label className="admin-field">
          <span>{copy.txDate}</span>
          <input
            type="date"
            value={(transactionModal.draft.transactionDate ?? "").slice(0, 10)}
            disabled={transactionModal.mode === "edit-limited"}
            onChange={(event: any)=>
              setTransactionModal({
                ...transactionModal,
                draft: {
                  ...transactionModal.draft,
                  transactionDate: event.target.value || null,
                },
              })
            }
            required
          />
        </label>
        <label className="admin-field admin-field-wide">
          <span>{copy.txCustomer}</span>
          <select
            value={transactionModal.draft.customerId}
            disabled={transactionModal.mode === "edit-limited"}
            onChange={(event: any)=> {
              const customer = customers.find((c: any)=> c.id === event.target.value);
              setTransactionModal({
                ...transactionModal,
                draft: {
                  ...transactionModal.draft,
                  customerId: event.target.value,
                  customerSnapshot: customer
                    ? {
                        code: customer.code,
                        name: customer.name,
                        phoneNumber: customer.phoneNumber,
                      }
                    : { code: "", name: "", phoneNumber: "" },
                },
              });
            }}
            required
          >
            <option value="">—</option>
            {customers.map((c: any)=> (
              <option key={c.id} value={c.id}>
                {c.name} ({language === "MN" ? "үлдэгдэл" : "bal"}: {formatStorePrice(c.outstandingBalance)})
              </option>
            ))}
          </select>
        </label>
      </div>

      {(() => {
        const selectedCust = customers.find((c: any)=> c.id === transactionModal.draft.customerId);
        if (!selectedCust) return null;
        return (
          <div className="admin-customer-tx-context" style={{ marginTop: "0.75rem" }}>
            <div className="admin-product-expand-stats">
              <div className="admin-expand-stat">
                <small>{copy.customerTotalSales}</small>
                <strong>{formatStorePrice(selectedCust.totalSales)}</strong>
              </div>
              <div className="admin-expand-stat">
                <small>{copy.customerTotalPaid}</small>
                <strong>{formatStorePrice(selectedCust.totalPaid)}</strong>
              </div>
              <div className="admin-expand-stat">
                <small>{copy.customerOutstanding}</small>
                <strong
                  style={{
                    color:
                      selectedCust.outstandingBalance > 0
                        ? "#b14141"
                        : selectedCust.outstandingBalance < 0
                          ? "#2f7a4a"
                          : "#3a3630",
                  }}
                >
                  {formatStorePrice(selectedCust.outstandingBalance)}
                </strong>
              </div>
              <div className="admin-expand-stat">
                <small>{language === "MN" ? "Шинэчлэгдсэн" : "Updated"}</small>
                <strong style={{ fontSize: "var(--fs-sm)" }}>
                  {selectedCust.lastTransactionAt
                    ? formatAdminDateTime(selectedCust.lastTransactionAt, language)
                    : "—"}
                </strong>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="admin-data-card" style={{ marginTop: "1rem" }}>
        <div className="admin-data-card-head">
          <div>
            <h3>{copy.txItems}</h3>
          </div>
          {transactionModal.mode !== "edit-limited" && <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const newItem: CustomerTransactionItem = {
                productId: 0,
                productName: "",
                category: "",
                image: null,
                variant: null,
                quantity: 1,
                soldQuantity: 0,
                unitPrice: 0,
                originalUnitPrice: 0,
                lineTotal: 0,
              };
              setTransactionModal({
                ...transactionModal,
                draft: {
                  ...transactionModal.draft,
                  items: [...transactionModal.draft.items, newItem],
                },
              });
            }}
          >
            <Plus size={14} /> {copy.txAddItem}
          </button>}
        </div>
        <div className="admin-data-table-wrap admin-data-table-wrap-scrollbar-visible">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                <th>{copy.txProduct}</th>
                <th>{copy.txVariant}</th>
                <th>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                <th>{language === "MN" ? "Зарсан" : "Sold"}</th>
                <th>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                <th>{copy.txUnitPrice}</th>
                <th>{copy.txLineTotal}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactionModal.draft.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="admin-table-empty">
                    {copy.addAtLeastOneItem}
                  </td>
                </tr>
              ) : (
                transactionModal.draft.items.map((item: any, idx: any)=> {
                  const selectedProduct = products.find((p: any)=> p.id === item.productId);
                  return (
                    <tr key={idx}>
                      <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                      <td>
                        <select
                          value={item.productId || ""}
                          disabled={transactionModal.mode === "edit-limited"}
                          onChange={(event: any)=> {
                            const productId = Number(event.target.value);
                            const product = products.find((p: any)=> p.id === productId);
                            // Goods can only leave a variant product through one of its
                            // variants, so the first one stands selected rather than
                            // leaving a blank that moves the product-level counter alone.
                            const firstVariant = product?.variants?.[0] ?? null;
                            const listPrice = Math.round(firstVariant?.price ?? product?.price ?? 0);
                            const activeDiscount = getActiveDiscount((discounts ?? []) as any[], productId);
                            const unitPrice = activeDiscount ? applyDiscount(listPrice, activeDiscount) : listPrice;
                            const primaryImage = product ? getProductPrimaryImage(product) : "";
                            const nextItems = [...transactionModal.draft.items];
                            nextItems[idx] = {
                              ...item,
                              productId,
                              productName: product?.name ?? "",
                              category: product?.category ?? "",
                              // data-URL images are huge and overflow Firestore's 1 MiB doc limit
                              image: primaryImage && !primaryImage.startsWith("data:") ? primaryImage : null,
                              unitPrice,
                              originalUnitPrice: listPrice,
                              variant: firstVariant?.name ?? null,
                              lineTotal: unitPrice * item.quantity,
                            };
                            setTransactionModal({
                              ...transactionModal,
                              draft: { ...transactionModal.draft, items: nextItems },
                            });
                          }}
                          required
                        >
                          <option value="">—</option>
                          {products
                            .filter((p: any)=> p.status === "active")
                            .map((p: any)=> {
                              const pStock = p.variants?.length
                                ? p.variants.reduce((s: any, v: any)=> s + (v.quantity || 0), 0)
                                : (p.totalStock ?? 0);
                              const pSold = p.soldCount ?? 0;
                              const pRemaining = pStock - pSold;
                              return (
                                <option key={p.id} value={p.id}>
                                  {getProductLabel(p.id, p.name)} ({pRemaining}/{pStock} - {pSold})
                                </option>
                              );
                            })}
                        </select>
                      </td>
                      <td>
                        {selectedProduct?.variants && selectedProduct.variants.length > 0 ? (
                          <select
                            value={item.variant ?? ""}
                            disabled={transactionModal.mode === "edit-limited"}
                            onChange={(event: any)=> {
                              const variantName = event.target.value || null;
                              const variant = selectedProduct.variants?.find(
                                (v: any)=> v.name === variantName,
                              );
                              const listPrice = Math.round(variant?.price ?? selectedProduct.price);
                              const activeDiscount = getActiveDiscount((discounts ?? []) as any[], item.productId);
                              const unitPrice = activeDiscount ? applyDiscount(listPrice, activeDiscount) : listPrice;
                              const nextItems = [...transactionModal.draft.items];
                              nextItems[idx] = {
                                ...item,
                                variant: variantName,
                                unitPrice,
                                originalUnitPrice: listPrice,
                                lineTotal: unitPrice * item.quantity,
                              };
                              setTransactionModal({
                                ...transactionModal,
                                draft: { ...transactionModal.draft, items: nextItems },
                              });
                            }}
                            required
                          >
                            {/* No blank option: a variant product cannot be moved without one. */}
                            {item.variant == null && <option value="">—</option>}
                            {selectedProduct.variants.map((v: any)=> {
                              const vRemaining = (v.quantity || 0) - (v.soldCount ?? 0);
                              return (
                                <option key={v.name} value={v.name}>
                                  {v.name} ({vRemaining}/{v.quantity || 0} - {v.soldCount ?? 0})
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          let stockTotal = 0;
                          let stockSold = 0;
                          if (selectedProduct) {
                            if (item.variant && selectedProduct.variants) {
                              const sv = selectedProduct.variants.find((v: any)=> v.name === item.variant);
                              stockTotal = sv ? (sv.quantity || 0) : 0;
                              stockSold = sv ? (sv.soldCount ?? 0) : 0;
                            } else {
                              stockTotal = selectedProduct.totalStock ?? 0;
                              stockSold = selectedProduct.soldCount ?? 0;
                            }
                          }
                          const prevEditItem = transactionModal.mode === "edit" && transactionModal.previous
                            ? transactionModal.previous.items.find(
                                (pi: any)=> pi.productId === item.productId && pi.variant === item.variant
                              )
                            : null;
                          const stockRemaining = stockTotal - stockSold + (prevEditItem ? prevEditItem.quantity : 0);
                          const maxQty = Math.max(1, stockRemaining);
                          const updateQty = (newQty: number) => {
                            const quantity = Math.max(1, Math.min(newQty, maxQty));
                            const nextItems = [...transactionModal.draft.items];
                            nextItems[idx] = {
                              ...item,
                              quantity,
                              lineTotal: item.unitPrice * quantity,
                            };
                            setTransactionModal({
                              ...transactionModal,
                              draft: { ...transactionModal.draft, items: nextItems },
                            });
                          };
                          const afterQty = stockRemaining - item.quantity;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                                <button
                                  type="button"
                                  className="admin-qty-btn"
                                  disabled={item.quantity <= 1 || transactionModal.mode === "edit-limited"}
                                  onClick={() => updateQty(item.quantity - 1)}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={maxQty}
                                  value={item.quantity}
                                  disabled={transactionModal.mode === "edit-limited"}
                                  onChange={(event: any)=>
                                    updateQty(Number(event.target.value) || 1)
                                  }
                                  style={{ width: "60px", textAlign: "center" }}
                                />
                                <button
                                  type="button"
                                  className="admin-qty-btn"
                                  disabled={item.quantity >= maxQty || transactionModal.mode === "edit-limited"}
                                  onClick={() => updateQty(item.quantity + 1)}
                                >
                                  +
                                </button>
                              </div>
                              {selectedProduct && (
                                <small
                                  style={{
                                    fontSize: "0.7rem",
                                    color: afterQty < 0 ? "#b14141" : "#8a8477",
                                  }}
                                >
                                  {stockRemaining}/{stockTotal} - {stockSold - (prevEditItem ? prevEditItem.quantity : 0)} → {afterQty}/{stockTotal} - {stockSold - (prevEditItem ? prevEditItem.quantity : 0) + item.quantity}
                                </small>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <button
                            type="button"
                            className="admin-qty-btn"
                            disabled={item.soldQuantity <= 0}
                            onClick={() => {
                              const nextItems = [...transactionModal.draft.items];
                              nextItems[idx] = { ...item, soldQuantity: item.soldQuantity - 1 };
                              setTransactionModal({ ...transactionModal, draft: { ...transactionModal.draft, items: nextItems } });
                            }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={item.quantity}
                            value={item.soldQuantity}
                            onChange={(event: any)=> {
                              const val = Math.max(0, Math.min(item.quantity, Number(event.target.value) || 0));
                              const nextItems = [...transactionModal.draft.items];
                              nextItems[idx] = { ...item, soldQuantity: val };
                              setTransactionModal({ ...transactionModal, draft: { ...transactionModal.draft, items: nextItems } });
                            }}
                            style={{ width: "60px", textAlign: "center" }}
                          />
                          <button
                            type="button"
                            className="admin-qty-btn"
                            disabled={item.soldQuantity >= item.quantity}
                            onClick={() => {
                              const nextItems = [...transactionModal.draft.items];
                              nextItems[idx] = { ...item, soldQuantity: item.soldQuantity + 1 };
                              setTransactionModal({ ...transactionModal, draft: { ...transactionModal.draft, items: nextItems } });
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <strong
                          style={{
                            color: item.quantity - item.soldQuantity > 0 ? "#b14141" : "#2f7a4a",
                          }}
                        >
                          {item.quantity - item.soldQuantity}
                        </strong>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          disabled={transactionModal.mode === "edit-limited"}
                          onChange={(event: any)=> {
                            const unitPrice = Math.max(0, Number(event.target.value) || 0);
                            const nextItems = [...transactionModal.draft.items];
                            nextItems[idx] = {
                              ...item,
                              unitPrice,
                              lineTotal: unitPrice * item.quantity,
                            };
                            setTransactionModal({
                              ...transactionModal,
                              draft: { ...transactionModal.draft, items: nextItems },
                            });
                          }}
                          style={{ width: "110px" }}
                        />
                        {(item.originalUnitPrice ?? 0) > item.unitPrice && (
                          <div style={{ fontSize: "0.7rem", color: "#dc2626", whiteSpace: "nowrap" }}>
                            <s style={{ color: "#9ca3af" }}>{formatStorePrice(item.originalUnitPrice)}</s>
                            {" "}−{formatStorePrice((item.originalUnitPrice ?? 0) - item.unitPrice)}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{formatStorePrice(item.lineTotal)}</strong>
                      </td>
                      <td>
                        {transactionModal.mode !== "edit-limited" && (
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() => {
                              const nextItems = transactionModal.draft.items.filter(
                                (_: any, i: any)=> i !== idx,
                              );
                              setTransactionModal({
                                ...transactionModal,
                                draft: { ...transactionModal.draft, items: nextItems },
                              });
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {transactionModal.draft.items.length > 0 && (() => {
              const ftItems = transactionModal.draft.items;
              const ftQty = ftItems.reduce((s: number, i: any) => s + (i.quantity || 0), 0);
              const ftSold = ftItems.reduce((s: number, i: any) => s + (i.soldQuantity || 0), 0);
              const ftRemaining = ftQty - ftSold;
              const ftQtyValue = ftItems.reduce((s: number, i: any) => s + (i.unitPrice || 0) * (i.quantity || 0), 0);
              const ftSoldValue = ftItems.reduce((s: number, i: any) => s + (i.unitPrice || 0) * (i.soldQuantity || 0), 0);
              const ftRemainingValue = ftQtyValue - ftSoldValue;
              const ftUnitPriceSum = ftItems.reduce((s: number, i: any) => s + (i.unitPrice || 0), 0);
              const ftLineTotal = ftItems.reduce((s: number, i: any) => s + (i.lineTotal || 0), 0);
              const ftSub = (value: number) => (
                <div style={{ fontSize: "0.7rem", fontWeight: 400, color: "#8a8477", whiteSpace: "nowrap" }}>
                  {formatStorePrice(value)}
                </div>
              );
              return (
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ color: "#8a8477", fontWeight: 600 }}>
                      {language === "MN" ? "Нийт" : "Total"} · {ftItems.length} {language === "MN" ? "бараа" : "items"}
                    </td>
                    <td>
                      <strong>{ftQty} ш</strong>
                      {ftSub(ftQtyValue)}
                    </td>
                    <td>
                      <strong>{ftSold} ш</strong>
                      {ftSub(ftSoldValue)}
                    </td>
                    <td>
                      <strong style={{ color: ftRemaining > 0 ? "#b14141" : "#2f7a4a" }}>{ftRemaining} ш</strong>
                      {ftSub(ftRemainingValue)}
                    </td>
                    <td>
                      <strong>{formatStorePrice(ftUnitPriceSum)}</strong>
                    </td>
                    <td>
                      <strong>{formatStorePrice(ftLineTotal)}</strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>

      <div className="admin-form-grid" style={{ marginTop: "1rem" }}>
        {(() => {
          const txSubtotal = transactionModal.draft.items.reduce((s: any, i: any)=> s + i.lineTotal, 0);
          const txDiscountType = transactionModal.draft.totals.discountType === "percent" ? "percent" : "amount";
          const txDiscountValue = Math.max(0, transactionModal.draft.totals.discountValue ?? transactionModal.draft.totals.discount ?? 0);
          const toAmount = (type: "amount" | "percent", value: number) =>
            Math.min(
              txSubtotal,
              type === "percent" ? Math.round((txSubtotal * Math.min(100, value)) / 100) : value,
            );
          const txDiscountAmount = toAmount(txDiscountType, txDiscountValue);
          const txVatMode = normalizeVatMode(transactionModal.draft.totals.vatMode);
          const txNetTotal = Math.max(0, txSubtotal - txDiscountAmount);
          const txVatAmount = calculateVat(txNetTotal, txVatMode);
          const txGrandTotal = txNetTotal + (txVatMode === "added" ? txVatAmount : 0);
          const applyDiscount = (type: "amount" | "percent", value: number) =>
            setTransactionModal({
              ...transactionModal,
              draft: {
                ...transactionModal.draft,
                totals: {
                  ...transactionModal.draft.totals,
                  discountType: type,
                  discountValue: value,
                  discount: toAmount(type, value),
                },
              },
            });
          return (
            <>
              <label className="admin-field">
                <span>{copy.txDiscount}</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    value={txDiscountType}
                    style={{ width: "5rem", flexShrink: 0 }}
                    onChange={(event: any)=> {
                      const nextType = event.target.value === "percent" ? "percent" : "amount";
                      applyDiscount(
                        nextType,
                        nextType === "percent" ? Math.min(100, txDiscountValue) : txDiscountValue,
                      );
                    }}
                  >
                    <option value="amount">₮</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={txDiscountType === "percent" ? 100 : undefined}
                    value={txDiscountValue}
                    style={{ flex: 1, minWidth: 0 }}
                    onChange={(event: any)=> {
                      const raw = Math.max(0, Number(event.target.value) || 0);
                      applyDiscount(
                        txDiscountType,
                        txDiscountType === "percent" ? Math.min(100, raw) : raw,
                      );
                    }}
                  />
                </div>
                {txDiscountType === "percent" && txDiscountAmount > 0 && (
                  <small style={{ color: "#8a8477" }}>= {formatStorePrice(txDiscountAmount)}</small>
                )}
              </label>
              <label className="admin-field">
                <span>{language === "MN" ? "НӨАТ (10%)" : "VAT (10%)"}</span>
                <select
                  value={txVatMode}
                  onChange={(event: any) =>
                    setTransactionModal({
                      ...transactionModal,
                      draft: {
                        ...transactionModal.draft,
                        totals: {
                          ...transactionModal.draft.totals,
                          vatMode: event.target.value as VatMode,
                        },
                      },
                    })
                  }
                >
                  <option value="none">{language === "MN" ? "НӨАТ-гүй" : "No VAT"}</option>
                  <option value="included">
                    {language === "MN" ? "Үнийн дүнд орсон" : "Included in the price"}
                  </option>
                  <option value="added">
                    {language === "MN" ? "Үнийн дүн дээр нэмэх" : "Added on top of the price"}
                  </option>
                </select>
                {txVatMode !== "none" && txVatAmount > 0 && (
                  <small style={{ color: "#8a8477" }}>
                    {txVatMode === "added" ? "+" : ""}
                    {formatStorePrice(txVatAmount)}
                  </small>
                )}
              </label>
              <label className="admin-field">
                <span>{copy.txGrandTotal}</span>
                <input type="text" value={formatStorePrice(txGrandTotal)} disabled />
              </label>
            </>
          );
        })()}
        <label className="admin-field">
          <span>{copy.txPaidAmount}</span>
          <input
            type="number"
            min={0}
            value={transactionModal.draft.payment.paidAmount}
            onChange={(event: any)=>
              setTransactionModal({
                ...transactionModal,
                draft: {
                  ...transactionModal.draft,
                  payment: {
                    ...transactionModal.draft.payment,
                    paidAmount: Math.max(0, Number(event.target.value) || 0),
                  },
                },
              })
            }
          />
        </label>
        <label className="admin-field">
          <span>{copy.txPaymentMethod}</span>
          <select
            value={transactionModal.draft.payment.method ?? ""}
            onChange={(event: any)=>
              setTransactionModal({
                ...transactionModal,
                draft: {
                  ...transactionModal.draft,
                  payment: {
                    ...transactionModal.draft.payment,
                    method:
                      (event.target.value as CustomerTransactionPaymentMethod) || null,
                  },
                },
              })
            }
          >
            <option value="">—</option>
            <option value="cash">{copy.txPaymentCash}</option>
            <option value="bank">{copy.txPaymentBank}</option>
            <option value="qpay">{copy.txPaymentQpay}</option>
            <option value="other">{copy.txPaymentOther}</option>
          </select>
        </label>
        <label className="admin-field admin-field-wide">
          <span>{copy.txNote}</span>
          <textarea
            value={transactionModal.draft.note}
            rows={2}
            onChange={(event: any)=>
              setTransactionModal({
                ...transactionModal,
                draft: { ...transactionModal.draft, note: event.target.value },
              })
            }
          />
        </label>
      </div>

      <div className="admin-modal-footer">
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => setTransactionModal(null)}
          disabled={transactionSavingState}
        >
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={transactionSavingState}>
          {copy.save}
        </button>
      </div>
    </form>
  </AdminModal>
)}

{txPaymentModal && (() => {
  const isEdit = typeof txPaymentModal.editIndex === "number";
  const customerTxsForPayment = (customerTransactions ?? []).filter(
    (t: any) => t.customerId === txPaymentModal.customerId && t.type !== "return",
  );
  const selectableTxs = customerTxsForPayment.filter(
    (t: any) => t.totals.grandTotal - t.payment.paidAmount > 0 || t.id === txPaymentModal.txId,
  );
  const liveTx = customerTxsForPayment.find((t: any) => t.id === txPaymentModal.txId) ?? null;
  const grandTotal = liveTx ? liveTx.totals.grandTotal : 0;
  const paidAmount = liveTx ? liveTx.payment.paidAmount : 0;
  const remaining = Math.max(0, grandTotal - paidAmount);
  const editEntry =
    isEdit && liveTx ? ((liveTx.payment.entries ?? [])[txPaymentModal.editIndex] ?? null) : null;
  // When editing, the entry's own amount is freed up before re-applying the new one.
  const available = remaining + (editEntry ? Math.round(editEntry.amount) : 0);
  const draftAmount = Math.max(0, Math.round(Number(txPaymentModal.draft.amount) || 0));
  const afterRemaining = available - draftAmount;
  const customerName =
    liveTx?.customerSnapshot?.name ??
    ((customers ?? []).find((c: any) => c.id === txPaymentModal.customerId)?.name ?? "");
  return (
    <AdminModal
      title={
        isEdit
          ? (language === "MN" ? "Төлбөр засах" : "Edit payment")
          : (language === "MN" ? "Төлбөр бүртгэх" : "Record payment")
      }
      description={liveTx ? `${liveTx.txNumber} — ${customerName}` : customerName}
      onClose={() => setTxPaymentModal(null)}
      disableClose={txPaymentSaving}
    >
      <form
        className="admin-modal-form"
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();
          if (!liveTx) {
            setTxPaymentError(language === "MN" ? "Гүйлгээ сонгоно уу" : "Select a transaction");
            return;
          }
          if (isEdit && !editEntry) {
            setTxPaymentError(language === "MN" ? "Төлбөрийн бичилт олдсонгүй" : "Payment record not found");
            return;
          }
          if (draftAmount <= 0) {
            setTxPaymentError(language === "MN" ? "Төлсөн дүн 0-ээс их байх ёстой" : "Amount must be greater than 0");
            return;
          }
          if (draftAmount > available) {
            setTxPaymentError(
              language === "MN"
                ? `Төлсөн дүн үлдэгдлээс их байж болохгүй (боломжит дүн: ${formatStorePrice(available)})`
                : `Amount cannot exceed the remaining balance (${formatStorePrice(available)})`,
            );
            return;
          }
          setTxPaymentSaving(true);
          setTxPaymentError(null);
          try {
            const input = {
              date: txPaymentModal.draft.date || new Date().toISOString().slice(0, 10),
              amount: draftAmount,
              note: txPaymentModal.draft.note,
              createdByUid: user?.uid ?? "",
            };
            if (isEdit) {
              await updateCustomerTransactionPaymentEntry(liveTx, txPaymentModal.editIndex, input);
            } else {
              await recordCustomerTransactionPayment(liveTx, input);
            }
            setTxPaymentModal(null);
          } catch (err) {
            setTxPaymentError(err instanceof Error ? err.message : String(err));
          } finally {
            setTxPaymentSaving(false);
          }
        }}
      >
        {txPaymentError && <div className="admin-sync-error">{txPaymentError}</div>}

        {liveTx && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", marginBottom: "1rem" }}>
            <div style={{ background: "#f5f3ee", borderRadius: "0.6rem", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <small style={{ color: "#8a8477" }}>{language === "MN" ? "Нийт дүн" : "Grand total"}</small>
              <strong>{formatStorePrice(grandTotal)}</strong>
            </div>
            <div style={{ background: "#f5f3ee", borderRadius: "0.6rem", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <small style={{ color: "#8a8477" }}>{language === "MN" ? "Төлсөн дүн" : "Paid"}</small>
              <strong style={{ color: "#2f7a4a" }}>{formatStorePrice(paidAmount)}</strong>
            </div>
            <div style={{ background: "#f5f3ee", borderRadius: "0.6rem", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <small style={{ color: "#8a8477" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</small>
              <strong style={{ color: remaining > 0 ? "#b14141" : "#2f7a4a" }}>{formatStorePrice(remaining)}</strong>
            </div>
          </div>
        )}

        <div className="admin-form-grid">
          <label className="admin-field admin-field-wide">
            <span>{language === "MN" ? "Гүйлгээ" : "Transaction"}</span>
            <select
              value={txPaymentModal.txId ?? ""}
              disabled={isEdit}
              onChange={(event: any) => {
                const nextTx = customerTxsForPayment.find((t: any) => t.id === event.target.value) ?? null;
                const nextOutstanding = nextTx
                  ? Math.max(0, nextTx.totals.grandTotal - nextTx.payment.paidAmount)
                  : 0;
                setTxPaymentModal({
                  ...txPaymentModal,
                  txId: event.target.value || null,
                  draft: { ...txPaymentModal.draft, amount: nextOutstanding },
                });
              }}
              required
            >
              <option value="">{language === "MN" ? "Гүйлгээ сонгох..." : "Select transaction..."}</option>
              {selectableTxs.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.txNumber} · {formatAdminDateTime(t.transactionDate ?? t.createdAt, language)} ·{" "}
                  {language === "MN" ? "Үлдэгдэл" : "Remaining"}{" "}
                  {formatStorePrice(Math.max(0, t.totals.grandTotal - t.payment.paidAmount))}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>{language === "MN" ? "Өдөр" : "Date"}</span>
            <input
              type="date"
              value={txPaymentModal.draft.date}
              onChange={(event: any) =>
                setTxPaymentModal({
                  ...txPaymentModal,
                  draft: { ...txPaymentModal.draft, date: event.target.value },
                })
              }
              required
            />
          </label>
          <label className="admin-field">
            <span>{language === "MN" ? "Төлсөн дүн" : "Amount paid"}</span>
            <input
              type="number"
              min={1}
              max={available}
              value={txPaymentModal.draft.amount || ""}
              onChange={(event: any) =>
                setTxPaymentModal({
                  ...txPaymentModal,
                  draft: {
                    ...txPaymentModal.draft,
                    amount: Math.max(0, Number(event.target.value) || 0),
                  },
                })
              }
              required
            />
          </label>
          <label className="admin-field admin-field-wide">
            <span>{language === "MN" ? "Тайлбар" : "Note"}</span>
            <textarea
              value={txPaymentModal.draft.note}
              rows={2}
              onChange={(event: any) =>
                setTxPaymentModal({
                  ...txPaymentModal,
                  draft: { ...txPaymentModal.draft, note: event.target.value },
                })
              }
            />
          </label>
        </div>

        {liveTx && draftAmount > 0 && (
          <p style={{ fontSize: "0.82rem", color: "#6b7280", margin: "0.5rem 0 0" }}>
            {language === "MN" ? "Хадгалсны дараах үлдэгдэл: " : "Remaining after saving: "}
            <strong style={{ color: afterRemaining > 0 ? "#b14141" : "#2f7a4a" }}>
              {formatStorePrice(Math.max(0, afterRemaining))}
            </strong>
            {afterRemaining <= 0 && (
              <span style={{ color: "#2f7a4a" }}>
                {" "}
                — {language === "MN" ? "бүрэн төлөгдөнө" : "fully paid"}
              </span>
            )}
          </p>
        )}

        <div className="admin-modal-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setTxPaymentModal(null)}
            disabled={txPaymentSaving}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              txPaymentSaving ||
              !liveTx ||
              (isEdit && !editEntry) ||
              draftAmount <= 0 ||
              draftAmount > available
            }
          >
            {txPaymentSaving
              ? (language === "MN" ? "Хадгалж байна..." : "Saving...")
              : isEdit
                ? (language === "MN" ? "Хадгалах" : "Save")
                : (language === "MN" ? "Төлбөр бүртгэх" : "Record payment")}
          </button>
        </div>
      </form>
    </AdminModal>
  );
})()}

{confirmModal && (
  <AdminModal title={confirmModal.title} onClose={() => { if (!confirmModalLoading) { setConfirmModal(null); setConfirmModalError(null); } }}>
    <div className="admin-confirm-body">
      <p>{confirmModal.description}</p>
      {confirmModalError && (
        <p style={{ color: "#b14141", fontSize: "0.85rem", marginTop: "0.5rem" }}>{confirmModalError}</p>
      )}
      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => { setConfirmModal(null); setConfirmModalError(null); }} disabled={confirmModalLoading}>
          {copy.cancel}
        </button>
        <button
          type="button"
          className={confirmModal.destructive ? "btn btn-danger" : "btn btn-primary"}
          disabled={confirmModalLoading}
          onClick={async () => {
            setConfirmModalLoading(true);
            setConfirmModalError(null);
            try {
              await confirmModal.onConfirm();
              setConfirmModal(null);
            } catch (err) {
              setConfirmModalError(err instanceof Error ? err.message : (language === "MN" ? "Алдаа гарлаа. Дахин оролдоно уу." : "An error occurred. Please try again."));
            } finally {
              setConfirmModalLoading(false);
            }
          }}
        >
          {confirmModalLoading ? (language === "MN" ? "Түр хүлээнэ үү..." : "Please wait...") : confirmModal.confirmLabel}
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
            onChange={(event: any)=>
              setUserProfileModal((current: any)=>
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
            onChange={(event: any)=>
              setUserProfileModal((current: any)=>
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
            {getManageableRoleOptions(userProfileModal.draft.role).map((roleOption: any)=> (
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
            onChange={(event: any)=>
              setUserProfileModal((current: any)=>
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
            onChange={(event: any)=>
              setUserProfileModal((current: any)=>
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

      {orderModal.draft.payment.status === "paid" && (
        orderModal.draft.payment.bonumPaymentVendor ||
        orderModal.draft.payment.bonumCompletedAt ||
        orderModal.draft.payment.bonumTerminalId ||
        orderModal.draft.payment.bonumAmount != null
      ) && (
        <div className="admin-inline-card">
          <div className="admin-inline-card-head">
            <strong>{language === "MN" ? "Bonum гүйлгээний мэдээлэл" : "Bonum transaction details"}</strong>
          </div>
          <div className="admin-bonum-txn-grid">
            {orderModal.draft.payment.bonumPaymentVendor && (
              <div className="admin-bonum-txn-row">
                <span>{language === "MN" ? "Төлбөрийн суваг" : "Payment vendor"}</span>
                <strong>{orderModal.draft.payment.bonumPaymentVendor}</strong>
              </div>
            )}
            {orderModal.draft.payment.bonumAmount != null && (
              <div className="admin-bonum-txn-row">
                <span>{language === "MN" ? "Гүйлгээний дүн" : "Transaction amount"}</span>
                <strong>{formatStorePrice(orderModal.draft.payment.bonumAmount)}</strong>
              </div>
            )}
            {orderModal.draft.payment.bonumCompletedAt && (
              <div className="admin-bonum-txn-row">
                <span>{language === "MN" ? "Төлбөр хийгдсэн огноо" : "Completed at"}</span>
                <strong>{orderModal.draft.payment.bonumCompletedAt}</strong>
              </div>
            )}
            {orderModal.draft.payment.bonumTerminalId && (
              <div className="admin-bonum-txn-row">
                <span>{language === "MN" ? "Терминал ID" : "Terminal ID"}</span>
                <strong>{orderModal.draft.payment.bonumTerminalId}</strong>
              </div>
            )}
            {orderModal.draft.payment.invoiceId && (
              <div className="admin-bonum-txn-row">
                <span>{language === "MN" ? "Нэхэмжлэлийн дугаар" : "Invoice ID"}</span>
                <strong className="admin-bonum-txn-mono">{orderModal.draft.payment.invoiceId}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="admin-form-grid">
        <label className="admin-field">
          <span>{copy.status}</span>
          <select value={orderModal.draft.status} onChange={handleOrderStatusChange}>
            {orderStatusOptions.map((statusOption: any)=> (
              <option key={statusOption.value} value={statusOption.value}>
                {statusOption.label}
              </option>
            ))}
          </select>
          <small>{copy.orderStatusHelp}</small>
        </label>

        <label className="admin-field">
          <span>{language === "MN" ? "Төлбөрийн хэлбэр" : "Payment method"}</span>
          <select value={orderModal.draft.payment.method} onChange={handleOrderPaymentMethodChange}>
            <option value="bonum">Bonum</option>
            <option value="cash">{language === "MN" ? "Бэлэн мөнгө" : "Cash"}</option>
            <option value="bank_transfer">{language === "MN" ? "Банкны шилжүүлэг" : "Bank transfer"}</option>
          </select>
        </label>
      </div>

      <div className="admin-form-grid">
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
            <small>
              {orderModal.draft.payment.method === "bonum"
                ? language === "MN"
                  ? "Bonum системээр баталгаажна — гараар засварлах боломжгүй"
                  : "Managed by Bonum — cannot be edited manually"
                : copy.orderStatusHelp}
            </small>
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
          {orderModal.draft.items.map((item: any, itemIndex: any)=> (
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
                  <strong>{getProductLabel(item.productId, item.name)}</strong>
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

{saleModal && (() => {
  const draft = saleModal.draft;
  const isEdit = saleModal.mode === "edit";
  const patchDraft = (patch: any) =>
    setSaleModal({ ...saleModal, draft: { ...draft, ...patch } });
  const patchItem = (index: number, patch: any) => {
    const nextItems = draft.items.map((item: any, i: number) => (i === index ? { ...item, ...patch } : item));
    patchDraft({ items: nextItems });
  };

  /**
   * Copies a directory customer into the sale. The address only follows when the contact
   * has one on file, so picking a customer never blanks an address already typed here.
   * The buyer kind is not copied — it is inferred from the organization name on save.
   */
  const applyContactToSale = (contact: CrmContactRecord) => {
    patchDraft({
      customer: {
        ...draft.customer,
        contactId: contact.id,
        fullName: contact.fullName,
        organizationName: contact.type === "organization" ? contact.organizationName : "",
        registrationNumber: contact.type === "organization" ? contact.registrationNumber : "",
        phoneNumber: contact.phoneNumber,
        email: contact.email ?? "",
      },
      ...(contact.address
        ? {
            address: {
              ...draft.address,
              region: contact.address.region,
              districtOrSoum: contact.address.districtOrSoum,
              khorooOrBag: contact.address.khorooOrBag,
              streetAddress: contact.address.streetAddress,
            },
          }
        : {}),
    });
  };

  // Delivered channels still prefill the shipping fee, but no customer or address
  // field is mandatory — an offline sale can be booked with the goods alone.
  const deliveryChannel = saleChannelRequiresAddress(draft.channel);

  const rawSubtotal = draft.items.reduce((sum: number, item: any) => sum + item.lineTotal, 0);
  // Хөнгөлөлт: a manual, whole-sale discount typed at checkout — either a flat ₮ amount or a
  // percent of the goods total — separate from any per-product catalogue discount, which is
  // already baked into item.unitPrice above.
  const discountType: SaleDiscountType = draft.discountType === "percent" ? "percent" : "amount";
  const discountValue = Math.max(0, draft.discountValue || 0);
  const discountTotal = Math.min(
    rawSubtotal,
    discountType === "percent"
      ? Math.round((rawSubtotal * Math.min(100, discountValue)) / 100)
      : Math.round(discountValue),
  );
  const subtotal = Math.max(0, rawSubtotal - discountTotal);
  const shippingFee = Math.max(0, Math.round(draft.shippingFee || 0));
  // НӨАТ 10% — either carved out of the item prices or charged on top of them, computed on
  // the discounted subtotal so a discounted sale is never taxed on the pre-discount amount.
  const vatMode = draft.vatMode ?? "none";
  const vatAmount = calculateSaleVat(subtotal, vatMode);
  const grandTotal = subtotal + shippingFee + (vatMode === "added" ? vatAmount : 0);
  const totalQuantity = draft.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
  const patchDiscount = (type: SaleDiscountType, value: number) =>
    patchDraft({ discountType: type, discountValue: value });

  const districtOptions = getDistrictOrSoumOptions(draft.address.region);
  const khorooOptions = getKhorooOrBagOptions(draft.address.region, draft.address.districtOrSoum);

  /** Remaining stock for a product/variant, used as a hint next to the quantity input. */
  const remainingStock = (productId: number, variant: string | null) => {
    const product = (products as any[]).find((p: any) => p.id === productId);
    if (!product) return null;
    if (variant && product.variants?.length) {
      const match = product.variants.find((v: any) => v.name === variant);
      return match ? (match.quantity || 0) - (match.soldCount ?? 0) : 0;
    }
    return (product.totalStock ?? 0) - (product.soldCount ?? 0);
  };

  return (
    <AdminModal
      title={
        isEdit
          ? language === "MN"
            ? `Борлуулалт засах (${draft.saleNumber})`
            : `Edit sale (${draft.saleNumber})`
          : language === "MN"
            ? "Борлуулалт бүртгэх"
            : "Register a sale"
      }
     
      onClose={closeSaleModal}
      xl
      disableClose={savingSale}
    >
      <form className="admin-modal-form" onSubmit={handleSaleSubmit}>
        {saleModalError && <div className="admin-sync-error">{saleModalError}</div>}

        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{language === "MN" ? "Борлуулалтын суваг" : "Sales channel"}</span>
            <select
              value={draft.channel}
              onChange={(event: any) => {
                const channel = event.target.value;
                // Switching to a delivered channel offers the standard shipping fee, but
                // never overwrites a fee the admin already typed.
                const needsDelivery = saleChannelRequiresAddress(channel);
                patchDraft({
                  channel,
                  shippingFee: needsDelivery && !draft.shippingFee ? SHIPPING_FEE : draft.shippingFee,
                });
              }}
              required
            >
              {saleChannelOptions.map((channelOption: any) => (
                <option key={channelOption.value} value={channelOption.value}>
                  {channelOption.label}
                </option>
              ))}
            </select>
            <small>
              {deliveryChannel
                ? language === "MN"
                  ? "Хүргэлттэй суваг — хүргэлтийн үнэ автоматаар бөглөгдөнө."
                  : "Delivered channel — the shipping fee is prefilled."
                : language === "MN"
                  ? "Газар дээрх борлуулалт — хүргэлтийн үнэгүй."
                  : "Over-the-counter sale — no shipping fee."}
            </small>
          </label>

          <label className="admin-field">
            <span>{copy.status}</span>
            <select value={draft.status} onChange={(event: any) => patchDraft({ status: event.target.value })}>
              {orderStatusOptions.map((statusOption: any) => (
                <option key={statusOption.value} value={statusOption.value}>
                  {statusOption.label}
                </option>
              ))}
            </select>
            <small>
              {draft.status === "new"
                ? language === "MN"
                  ? "Төлбөр хүлээгдэж буй борлуулалт болно. Нөөцөөс ХАСАГДАХГҮЙ — төлвийг өөрчилсөн үед бараа агуулахаас гарна."
                  : "The sale is saved with a pending payment. Stock is NOT deducted — the goods leave the shelf when the status changes."
                : language === "MN"
                  ? "Төлбөр төлөгдсөн гэж бүртгэгдэж, санхүүгийн бичилт хийгдэж, нөөцөөс шууд хасагдана."
                  : "Saved as paid — the revenue journal entry is posted and the stock is deducted."}
            </small>
          </label>

          <label className="admin-field">
            <span>{language === "MN" ? "Төлбөрийн хэлбэр" : "Payment method"}</span>
            <select
              value={draft.paymentMethod}
              onChange={(event: any) => patchDraft({ paymentMethod: event.target.value })}
            >
              <option value="cash">{language === "MN" ? "Бэлэн мөнгө" : "Cash"}</option>
              <option value="bank_transfer">{language === "MN" ? "Банкны шилжүүлэг" : "Bank transfer"}</option>
              <option value="bonum">Bonum</option>
            </select>
          </label>
        </div>

        <AdminCollapsibleCard
          title={copy.customerInfo}
          note={language === "MN" ? "Сонголттой" : "Optional"}
        >
          <SaleContactPicker
            contacts={crmContacts as CrmContactRecord[]}
            selectedId={draft.customer.contactId ?? null}
            copy={copy}
            language={language}
            onSelect={applyContactToSale}
            onClear={() => patchDraft({ customer: { ...draft.customer, contactId: null } })}
          />
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{language === "MN" ? "Худалдан авагчийн нэр" : "Buyer name"}</span>
              <input
                type="text"
                value={draft.customer.fullName}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, fullName: event.target.value } })
                }
              />
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Байгууллагын нэр" : "Organization name"}</span>
              <input
                type="text"
                value={draft.customer.organizationName}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, organizationName: event.target.value } })
                }
              />
              <small>
                {language === "MN"
                  ? "Бөглөвөл байгууллагын борлуулалт болж бүртгэгдэнэ."
                  : "Filling this in books the sale as an organization sale."}
              </small>
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Регистрийн дугаар" : "Register number"}</span>
              <input
                type="text"
                value={draft.customer.registrationNumber}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, registrationNumber: event.target.value } })
                }
              />
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Утасны дугаар" : "Phone number"}</span>
              <input
                type="tel"
                value={draft.customer.phoneNumber}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, phoneNumber: event.target.value } })
                }
              />
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "И-мэйл" : "Email"}</span>
              <input
                type="email"
                value={draft.customer.email ?? ""}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, email: event.target.value } })
                }
              />
            </label>
            <label className="admin-field admin-field-wide">
              <span>{copy.note}</span>
              <textarea
                rows={2}
                value={draft.customer.note}
                onChange={(event: any) =>
                  patchDraft({ customer: { ...draft.customer, note: event.target.value } })
                }
              />
            </label>
          </div>
        </AdminCollapsibleCard>

        <AdminCollapsibleCard
          title={copy.addressInfo}
          note={language === "MN" ? "Сонголттой" : "Optional"}
        >
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{language === "MN" ? "Аймаг / Хот" : "Province / City"}</span>
              <select
                value={draft.address.region}
                onChange={(event: any) =>
                  patchDraft({
                    // Districts and khoroos are region-specific — reset both when the region changes.
                    address: {
                      ...draft.address,
                      region: event.target.value,
                      districtOrSoum: "",
                      khorooOrBag: "",
                    },
                  })
                }
              >
                {getRegionOptions().map((region: string) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Дүүрэг / Сум" : "District / Soum"}</span>
              <select
                value={draft.address.districtOrSoum}
                onChange={(event: any) =>
                  patchDraft({
                    address: { ...draft.address, districtOrSoum: event.target.value, khorooOrBag: "" },
                  })
                }
              >
                <option value="">—</option>
                {districtOptions.map((district: string) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>{language === "MN" ? "Хороо / Баг" : "Khoroo / Bag"}</span>
              <select
                value={draft.address.khorooOrBag}
                onChange={(event: any) =>
                  patchDraft({ address: { ...draft.address, khorooOrBag: event.target.value } })
                }
                disabled={khorooOptions.length === 0}
              >
                <option value="">—</option>
                {khorooOptions.map((khoroo: string) => (
                  <option key={khoroo} value={khoroo}>
                    {khoroo}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field admin-field-wide">
              <span>{language === "MN" ? "Байр, орц, давхар, тоот" : "Street address"}</span>
              <input
                type="text"
                value={draft.address.streetAddress}
                onChange={(event: any) =>
                  patchDraft({ address: { ...draft.address, streetAddress: event.target.value } })
                }
              />
            </label>
            <label className="admin-field admin-field-wide">
              <span>{language === "MN" ? "Нэмэлт хаяг" : "Additional address"}</span>
              <input
                type="text"
                value={draft.address.additionalAddress}
                onChange={(event: any) =>
                  patchDraft({ address: { ...draft.address, additionalAddress: event.target.value } })
                }
              />
            </label>
          </div>
        </AdminCollapsibleCard>

        <div className="admin-data-card" style={{ marginTop: "1rem" }}>
          <div className="admin-data-card-head">
            <div>
              <h3>{copy.orderItemsLabel}</h3>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() =>
                patchDraft({
                  items: [
                    ...draft.items,
                    {
                      productId: 0,
                      name: "",
                      category: "",
                      image: null,
                      variant: null,
                      quantity: 1,
                      unitPrice: 0,
                      originalUnitPrice: 0,
                      lineTotal: 0,
                    },
                  ],
                })
              }
            >
              <Plus size={14} /> {copy.txAddItem}
            </button>
          </div>
          {draft.items.length === 0 ? (
            <p className="admin-expand-empty">{copy.addAtLeastOneItem}</p>
          ) : (
            <div className="admin-sale-item-list">
              {draft.items.map((item: any, idx: number) => {
                const selectedProduct = (products as any[]).find((p: any) => p.id === item.productId);
                const remaining = remainingStock(item.productId, item.variant);
                return (
                  <div key={idx} className="admin-sale-item-card">
                    <div className="admin-sale-item-card-head">
                      <span className="admin-sale-item-index">#{idx + 1}</span>
                      <button
                        type="button"
                        className="admin-icon-btn"
                        aria-label={language === "MN" ? "Бараа хасах" : "Remove item"}
                        onClick={() =>
                          patchDraft({ items: draft.items.filter((_: any, i: number) => i !== idx) })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <label className="admin-field admin-field-wide">
                      <span>{copy.txProduct}</span>
                      <select
                        value={item.productId || ""}
                        onChange={(event: any) => {
                          const productId = Number(event.target.value);
                          const product = (products as any[]).find((p: any) => p.id === productId);
                          // Goods can only leave a variant product through one of its
                          // variants, so the first one stands selected rather than leaving
                          // a blank that would move the product-level counter alone.
                          const firstVariant = product?.variants?.[0] ?? null;
                          const listPrice = Math.round(firstVariant?.price ?? product?.price ?? 0);
                          const activeDiscount = getActiveDiscount((discounts ?? []) as any[], productId);
                          const unitPrice = activeDiscount ? applyDiscount(listPrice, activeDiscount) : listPrice;
                          const primaryImage = product ? getProductPrimaryImage(product) : "";
                          patchItem(idx, {
                            productId,
                            name: product?.name ?? "",
                            category: product?.category ?? "",
                            // data-URL images are huge and overflow Firestore's 1 MiB doc limit
                            image: primaryImage && !primaryImage.startsWith("data:") ? primaryImage : null,
                            variant: firstVariant?.name ?? null,
                            unitPrice,
                            originalUnitPrice: listPrice,
                            lineTotal: unitPrice * item.quantity,
                          });
                        }}
                        required
                      >
                        <option value="">—</option>
                        {(products as any[])
                          .filter((p: any) => p.status === "active")
                          .map((p: any) => {
                            const pStock = p.variants?.length
                              ? p.variants.reduce((s: number, v: any) => s + (v.quantity || 0), 0)
                              : (p.totalStock ?? 0);
                            const pSold = p.soldCount ?? 0;
                            return (
                              <option key={p.id} value={p.id}>
                                {getProductLabel(p.id, p.name)} ({pStock - pSold}/{pStock})
                              </option>
                            );
                          })}
                      </select>
                    </label>

                    {selectedProduct?.variants && selectedProduct.variants.length > 0 && (
                      <label className="admin-field admin-field-wide">
                        <span>{copy.txVariant}</span>
                        <select
                          value={item.variant ?? ""}
                          onChange={(event: any) => {
                            const variantName = event.target.value || null;
                            const variant = selectedProduct.variants?.find((v: any) => v.name === variantName);
                            const listPrice = Math.round(variant?.price ?? selectedProduct.price);
                            const activeDiscount = getActiveDiscount((discounts ?? []) as any[], item.productId);
                            const unitPrice = activeDiscount ? applyDiscount(listPrice, activeDiscount) : listPrice;
                            patchItem(idx, {
                              variant: variantName,
                              unitPrice,
                              originalUnitPrice: listPrice,
                              lineTotal: unitPrice * item.quantity,
                            });
                          }}
                          required
                        >
                          {/* No blank option: a variant product cannot be sold without one. */}
                          {item.variant == null && <option value="">—</option>}
                          {selectedProduct.variants.map((v: any) => (
                            <option key={v.name} value={v.name}>
                              {v.name} ({(v.quantity || 0) - (v.soldCount ?? 0)}/{v.quantity || 0})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="admin-sale-item-card-row">
                      <div className="admin-field">
                        <span>{language === "MN" ? "Тоо" : "Qty"}</span>
                        <div className="admin-qty-stepper">
                          <button
                            type="button"
                            aria-label={language === "MN" ? "Хасах" : "Decrease"}
                            disabled={item.quantity <= 1}
                            onClick={() => {
                              const quantity = Math.max(1, item.quantity - 1);
                              patchItem(idx, { quantity, lineTotal: item.unitPrice * quantity });
                            }}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event: any) => {
                              const quantity = Math.max(1, Number(event.target.value) || 1);
                              patchItem(idx, { quantity, lineTotal: item.unitPrice * quantity });
                            }}
                          />
                          <button
                            type="button"
                            aria-label={language === "MN" ? "Нэмэх" : "Increase"}
                            onClick={() => {
                              const quantity = item.quantity + 1;
                              patchItem(idx, { quantity, lineTotal: item.unitPrice * quantity });
                            }}
                          >
                            +
                          </button>
                        </div>
                        {remaining != null && (
                          <small style={{ color: item.quantity > remaining ? "#b14141" : "#8a8477" }}>
                            {language === "MN" ? "Үлдэгдэл" : "Remaining"}: {remaining}
                          </small>
                        )}
                      </div>

                      <label className="admin-field">
                        <span>{copy.txUnitPrice}</span>
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice}
                          onChange={(event: any) => {
                            const unitPrice = Math.max(0, Number(event.target.value) || 0);
                            patchItem(idx, { unitPrice, lineTotal: unitPrice * item.quantity });
                          }}
                        />
                        {(item.originalUnitPrice ?? 0) > item.unitPrice && (
                          <small style={{ color: "#dc2626" }}>
                            <s style={{ color: "#9ca3af" }}>{formatStorePrice(item.originalUnitPrice)}</s>{" "}
                            −{formatStorePrice((item.originalUnitPrice ?? 0) - item.unitPrice)}
                          </small>
                        )}
                      </label>
                    </div>

                    <div className="admin-sale-item-card-total">
                      <span>{copy.txLineTotal}</span>
                      <strong>{formatStorePrice(item.lineTotal)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-form-grid" style={{ marginTop: "1rem" }}>
          <label className="admin-field">
            <span>{language === "MN" ? "Хөнгөлөлт" : "Discount"}</span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select
                value={discountType}
                style={{ width: "5rem", flexShrink: 0 }}
                onChange={(event: any) => {
                  const nextType: SaleDiscountType = event.target.value === "percent" ? "percent" : "amount";
                  patchDiscount(nextType, nextType === "percent" ? Math.min(100, discountValue) : discountValue);
                }}
              >
                <option value="amount">₮</option>
                <option value="percent">%</option>
              </select>
              <input
                type="number"
                min={0}
                max={discountType === "percent" ? 100 : undefined}
                value={discountValue}
                style={{ flex: 1, minWidth: 0 }}
                onChange={(event: any) => {
                  const raw = Math.max(0, Number(event.target.value) || 0);
                  patchDiscount(discountType, discountType === "percent" ? Math.min(100, raw) : raw);
                }}
              />
            </div>
            {discountType === "percent" && discountTotal > 0 && (
              <small>= {formatStorePrice(discountTotal)}</small>
            )}
          </label>

          <label className="admin-field">
            <span>{language === "MN" ? "Хүргэлтийн үнэ" : "Shipping fee"}</span>
            <input
              type="number"
              min={0}
              value={draft.shippingFee}
              onChange={(event: any) => patchDraft({ shippingFee: Math.max(0, Number(event.target.value) || 0) })}
            />
          </label>

          <label className="admin-field">
            <span>{language === "MN" ? "НӨАТ (10%)" : "VAT (10%)"}</span>
            <select value={vatMode} onChange={(event: any) => patchDraft({ vatMode: event.target.value })}>
              <option value="included">
                {language === "MN" ? "Үнийн дүнд орсон" : "Included in the price"}
              </option>
              <option value="added">
                {language === "MN" ? "Үнийн дүн дээр нэмэх" : "Added on top of the price"}
              </option>
              <option value="none">{language === "MN" ? "НӨАТ-гүй" : "No VAT"}</option>
            </select>
            <small>
              {vatMode === "included"
                ? language === "MN"
                  ? "Барааны дүнгээс НӨАТ ялгаж тооцно — нийт дүн өөрчлөгдөхгүй."
                  : "VAT is carved out of the item total — the grand total stays the same."
                : vatMode === "added"
                  ? language === "MN"
                    ? "Барааны дүн дээр НӨАТ нэмэгдэж нийт дүн өснө."
                    : "VAT is charged on top, raising the grand total."
                  : language === "MN"
                    ? "Энэ борлуулалтад НӨАТ тооцохгүй."
                    : "No VAT is charged on this sale."}
            </small>
          </label>

          <label className="admin-field">
            <span>{language === "MN" ? "НӨАТ дүн" : "VAT amount"}</span>
            <input type="text" value={formatStorePrice(vatAmount)} readOnly tabIndex={-1} />
            <small>
              {language === "MN"
                ? "Барааны дүнгээс 10%-иар автоматаар бодогдоно."
                : "Calculated automatically as 10% of the item total."}
            </small>
          </label>
        </div>

        <div className="admin-order-totals">
          <div className="admin-order-totals-row">
            <span>
              {language === "MN"
                ? `Барааны дүн · ${totalQuantity} ширхэг`
                : `Subtotal · ${totalQuantity} pcs`}
            </span>
            <span>{formatStorePrice(rawSubtotal)}</span>
          </div>
          {discountTotal > 0 && (
            <div className="admin-order-totals-row">
              <span>{language === "MN" ? "Хөнгөлөлт" : "Discount"}</span>
              <span style={{ color: "#dc2626" }}>−{formatStorePrice(discountTotal)}</span>
            </div>
          )}
          <div className="admin-order-totals-row">
            <span>{language === "MN" ? "Хүргэлтийн үнэ" : "Shipping fee"}</span>
            <span>{formatStorePrice(shippingFee)}</span>
          </div>
          {vatMode !== "none" && (
            <div className="admin-order-totals-row">
              <span>
                {language === "MN" ? "НӨАТ (10%)" : "VAT (10%)"}
                {" · "}
                {vatMode === "included"
                  ? language === "MN" ? "үнэд багтсан" : "included"
                  : language === "MN" ? "нэмэгдсэн" : "added"}
              </span>
              <span>{vatMode === "added" ? "+" : ""}{formatStorePrice(vatAmount)}</span>
            </div>
          )}
          <div className="admin-order-totals-row admin-order-totals-grand">
            <span>{language === "MN" ? "Нийт дүн" : "Grand total"}</span>
            <strong>{formatStorePrice(grandTotal)}</strong>
          </div>
        </div>

        <div className="admin-modal-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={closeSaleModal}
            disabled={savingSale}
          >
            {copy.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={savingSale}>
            {savingSale ? "..." : copy.save}
          </button>
        </div>
      </form>
    </AdminModal>
  );
})()}

{ctx.discountModal && (() => {
  const dm = ctx.discountModal;
  const isCreateMode = dm.mode === "create";
  const selectedIds = new Set<number>(dm.selectedProductIds ?? []);
  const setSelectedIds = (ids: number[]) =>
    ctx.setDiscountModal((cur: any) => (cur ? { ...cur, selectedProductIds: ids } : cur));

  const productsByCategory = new Map<string, any[]>();
  (products as any[]).forEach((p: any) => {
    const key = String(p.category ?? "");
    if (!productsByCategory.has(key)) productsByCategory.set(key, []);
    productsByCategory.get(key)!.push(p);
  });
  const categoryGroups = Array.from(productsByCategory.entries());
  const allProductIds = (products as any[]).map((p: any) => p.id);
  const allSelected = allProductIds.length > 0 && allProductIds.every((id: number) => selectedIds.has(id));
  const toggleAllProducts = () => setSelectedIds(allSelected ? [] : allProductIds);
  const toggleCategory = (slug: string) => {
    const ids = (productsByCategory.get(slug) ?? []).map((p: any) => p.id);
    const everySelected = ids.length > 0 && ids.every((id: number) => selectedIds.has(id));
    const next = new Set(selectedIds);
    ids.forEach((id: number) => (everySelected ? next.delete(id) : next.add(id)));
    setSelectedIds(Array.from(next));
  };
  const toggleProduct = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(Array.from(next));
  };
  const categoryTitle = (slug: string) =>
    collectionNameBySlug.get(slug) ?? (slug || (language === "MN" ? "Бусад" : "Other"));

  return (
  <AdminModal
    title={dm.mode === "create" ? copy.discountModalCreate : copy.discountModalEdit}
    onClose={() => ctx.setDiscountModal(null)}
  >
    <form
      className="admin-modal-form"
      onSubmit={(event: any) => {
        event.preventDefault();
        if (isCreateMode) {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) return;
          // One discount record per selected product. A product that already
          // has a discount gets it replaced instead of duplicated.
          let nextId = dm.draft.id;
          const usedIds = new Set(((discounts ?? []) as any[]).map((d: any) => d.id));
          ids.forEach((pid) => {
            const existing = ((discounts ?? []) as any[]).find((d: any) => d.productId === pid);
            let id: number;
            if (existing) {
              id = existing.id;
            } else {
              while (usedIds.has(nextId)) nextId++;
              id = nextId;
              usedIds.add(id);
            }
            ctx.saveDiscountDraft({ ...dm.draft, id, productId: pid });
          });
        } else {
          ctx.saveDiscountDraft(dm.draft);
        }
        ctx.setDiscountModal(null);
      }}
    >
      <div className="admin-form-grid">
        {isCreateMode ? (
          <div className="admin-field admin-field-wide">
            <span>{copy.discountProduct}</span>
            <div className="discount-picker">
              <label className="discount-picker-row discount-picker-all">
                <input type="checkbox" checked={allSelected} onChange={toggleAllProducts} />
                {language === "MN" ? "Бүх бүтээгдэхүүн" : "All products"}
                <span className="discount-picker-count">
                  {selectedIds.size}/{allProductIds.length}
                </span>
              </label>
              {categoryGroups.map(([slug, catProducts]) => {
                const ids = catProducts.map((p: any) => p.id);
                const everySelected = ids.length > 0 && ids.every((id: number) => selectedIds.has(id));
                const someSelected = ids.some((id: number) => selectedIds.has(id));
                const selectedInCategory = ids.filter((id: number) => selectedIds.has(id)).length;
                return (
                  <div key={slug || "uncategorized"}>
                    <label className="discount-picker-row discount-picker-group-head">
                      <input
                        type="checkbox"
                        checked={everySelected}
                        ref={(el) => { if (el) el.indeterminate = !everySelected && someSelected; }}
                        onChange={() => toggleCategory(slug)}
                      />
                      {categoryTitle(slug)}
                      <span className="discount-picker-count">
                        {selectedInCategory}/{ids.length}
                      </span>
                    </label>
                    {catProducts.map((p: any) => {
                      const image = getProductPrimaryImage(p);
                      const checked = selectedIds.has(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`discount-picker-row discount-picker-item${checked ? " checked" : ""}`}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} />
                          <span className="discount-picker-thumb">
                            {image ? <img src={image} alt={p.name} /> : (p.name || "?").slice(0, 1)}
                          </span>
                          <span className="discount-picker-name">{getProductLabel(p.id, p.name)}</span>
                          <span className="discount-picker-meta">
                            ID: {p.id} · {formatStorePrice(p.price)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <small
              className="discount-picker-hint"
              style={{ color: selectedIds.size === 0 ? "#b3261e" : "#2f7a4a" }}
            >
              {selectedIds.size === 0
                ? (language === "MN" ? "Хямдрал оруулах бүтээгдэхүүнээ сонгоно уу." : "Select at least one product.")
                : `${selectedIds.size} ${language === "MN" ? "бүтээгдэхүүн сонгогдсон" : "products selected"}`}
            </small>
          </div>
        ) : (
          <label className="admin-field admin-field-wide">
            <span>{copy.discountProduct}</span>
            <select
              value={dm.draft.productId}
              onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, productId: Number(e.target.value) } } : cur)}
              required
            >
              <option value={0} disabled>{language === "MN" ? "Бүтээгдэхүүн сонгоно уу" : "Select a product"}</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>{getProductLabel(p.id, p.name)} (ID: {p.id})</option>
              ))}
            </select>
          </label>
        )}

        <label className="admin-field">
          <span>{copy.discountType}</span>
          <select
            value={ctx.discountModal.draft.type}
            onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, type: e.target.value } } : cur)}
          >
            <option value="percent">{copy.discountTypePercent}</option>
            <option value="amount">{copy.discountTypeAmount}</option>
          </select>
        </label>

        <label className="admin-field">
          <span>{copy.discountValue} {ctx.discountModal.draft.type === "percent" ? "(%)" : "(₮)"}</span>
          <input
            type="number"
            min={0}
            max={ctx.discountModal.draft.type === "percent" ? 100 : undefined}
            step={1}
            value={ctx.discountModal.draft.value}
            onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, value: Number(e.target.value) } } : cur)}
            required
          />
        </label>

        <label className="admin-field">
          <span>{copy.discountStartAt}</span>
          <input
            type="date"
            value={ctx.discountModal.draft.startAt}
            onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, startAt: e.target.value } } : cur)}
            required
          />
        </label>

        <label className="admin-field">
          <span>{copy.discountEndAt}</span>
          <input
            type="date"
            value={ctx.discountModal.draft.endAt}
            onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, endAt: e.target.value } } : cur)}
            required
          />
        </label>

        <label className="admin-field">
          <span>{copy.status}</span>
          <select
            value={ctx.discountModal.draft.status}
            onChange={(e: any) => ctx.setDiscountModal((cur: any) => cur ? { ...cur, draft: { ...cur.draft, status: e.target.value } } : cur)}
          >
            <option value="active">{copy.active}</option>
            <option value="inactive">{copy.inactive}</option>
          </select>
        </label>
      </div>

      <div className="admin-modal-footer">
        <button type="button" className="btn btn-outline" onClick={() => ctx.setDiscountModal(null)}>
          {copy.cancel}
        </button>
        <button type="submit" className="btn btn-primary" disabled={isCreateMode && selectedIds.size === 0}>
          {copy.save}
        </button>
      </div>
    </form>
  </AdminModal>
  );
})()}
    </>
  );
}
