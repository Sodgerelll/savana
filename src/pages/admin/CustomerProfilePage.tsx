import "../../admin.css";
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCustomerProfile } from "../../hooks/useCustomerProfile";
import { useCustomerTransfers } from "../../hooks/useCustomerTransfers";
import { CustomerProfileHeader } from "../../components/customer/CustomerProfileHeader";
import { TransferListTab } from "../../components/customer/TransferListTab";
import { ProductStatsTab } from "../../components/customer/ProductStatsTab";
import { PaymentTab } from "../../components/customer/PaymentTab";
import { PricingTab } from "../../components/customer/PricingTab";
import { ReturnsTab } from "../../components/customer/ReturnsTab";
import { TimelineTab } from "../../components/customer/TimelineTab";
import { InlineTransferWizard } from "../../components/transfer/InlineTransferWizard";
import { ToastContainer } from "../../components/shared/Toast";

type TabKey =
  | "transfers"
  | "products"
  | "payments"
  | "pricing"
  | "returns"
  | "timeline";

const TABS: { key: TabKey; label: string }[] = [
  { key: "transfers", label: "Захиалга" },
  { key: "products", label: "Авсан бараа" },
  { key: "payments", label: "Төлбөр тооцоо" },
  { key: "pricing", label: "Үнэ & Тариф" },
  { key: "returns", label: "Буцаалт" },
  { key: "timeline", label: "Түүх" },
];

export default function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("transfers");
  const [showWizard, setShowWizard] = useState(false);

  const { customer, loading: customerLoading, error } = useCustomerProfile(id);
  const { transfers, loading: transfersLoading, hasMore: transfersHasMore, loadMore: transfersLoadMore } = useCustomerTransfers(id);

  if (customerLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Ачаалж байна...</div>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-lg font-medium mb-2">{error ?? "Харилцагч олдсонгүй"}</div>
          <button
            onClick={() => navigate("/admin/customers")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Буцах
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />

      {/* Top nav */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/customers")}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-sm text-gray-500">Харилцагчид</span>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-900 font-medium truncate">{customer.name}</span>
      </div>

      {/* Inline Transfer Wizard */}
      {showWizard && (
        <InlineTransferWizard
          customerId={customer.id}
          customerName={customer.name}
          customerBalance={customer.outstandingBalance}
          customerCreditLimit={customer.creditLimit}
          onClose={() => setShowWizard(false)}
          onSuccess={() => setActiveTab("transfers")}
        />
      )}

      {/* Profile Header */}
      <CustomerProfileHeader
        customer={customer}
        onNewTransfer={() => setShowWizard(!showWizard)}
      />

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6">
        <div className="flex gap-0.5 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 sm:px-5 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.key
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        {activeTab === "transfers" && (
          <TransferListTab
            customerId={customer.id}
            transfers={transfers}
            loading={transfersLoading}
            hasMore={transfersHasMore}
            onLoadMore={transfersLoadMore}
          />
        )}
        {activeTab === "products" && (
          <ProductStatsTab customerId={customer.id} transfers={transfers} />
        )}
        {activeTab === "payments" && (
          <PaymentTab customer={customer} transfers={transfers} />
        )}
        {activeTab === "pricing" && <PricingTab customer={customer} />}
        {activeTab === "returns" && <ReturnsTab transfers={transfers} />}
        {activeTab === "timeline" && <TimelineTab customerId={customer.id} />}
      </div>
    </div>
  );
}
