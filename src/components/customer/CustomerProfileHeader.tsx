import { Building2, User, Store, Phone, MapPin, Edit2 } from "lucide-react";
import type { Customer } from "../../types/crm";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";

const TYPE_LABELS: Record<string, string> = {
  ORGANIZATION: "Байгууллага",
  INDIVIDUAL: "Хувь хүн",
  RETAIL_POINT: "Дэлгүүр",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  ORGANIZATION: <Building2 className="w-6 h-6" />,
  INDIVIDUAL: <User className="w-6 h-6" />,
  RETAIL_POINT: <Store className="w-6 h-6" />,
};

const TYPE_BG: Record<string, string> = {
  ORGANIZATION: "bg-teal-500",
  INDIVIDUAL: "bg-purple-500",
  RETAIL_POINT: "bg-rose-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  WHOLESALE: "Бөөний",
  RETAIL: "Жижиглэн",
  VIP: "VIP",
  REGULAR: "Энгийн",
};

interface Props {
  customer: Customer;
  onNewTransfer: () => void;
  onEdit?: () => void;
}

export function CustomerProfileHeader({ customer, onNewTransfer, onEdit }: Props) {
  const initials = customer.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const stats = [
    { label: "Захиалга", value: String(customer.totalOrders) },
    {
      label: "Борлуулалт",
      value: (
        <MoneyFormat
          amount={customer.totalRevenue}
          className="text-xl font-bold text-gray-900"
        />
      ),
    },
    {
      label: "Өр",
      value: (
        <MoneyFormat
          amount={customer.balance}
          className={`text-xl font-bold ${customer.balance > 0 ? "text-red-600" : "text-green-600"}`}
        />
      ),
    },
    {
      label: "Лимит",
      value: (
        <MoneyFormat amount={customer.creditLimit} className="text-xl font-bold text-gray-900" />
      ),
    },
    {
      label: "Сүүлд",
      value: customer.lastOrderDate ? (
        <DateFormat value={customer.lastOrderDate} className="text-xl font-bold text-gray-900" />
      ) : (
        <span className="text-xl font-bold text-gray-400">—</span>
      ),
    },
  ];

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-5">
      {/* Top Row */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${
            TYPE_BG[customer.type] ?? "bg-gray-500"
          }`}
        >
          {initials || TYPE_ICON[customer.type]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{customer.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-gray-500">
                  {TYPE_LABELS[customer.type] ?? customer.type}
                </span>
                <span className="text-gray-300">•</span>
                <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {CATEGORY_LABELS[customer.category] ?? customer.category}
                </span>
                <span
                  className={`text-sm px-2 py-0.5 rounded-full font-medium ${
                    customer.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {customer.isActive ? "Идэвхтэй" : "Идэвхгүй"}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-500">
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {customer.phone}
                  </span>
                )}
                {(customer.city || customer.district) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {[customer.city, customer.district].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Засах
                </button>
              )}
              <button
                type="button"
                onClick={onNewTransfer}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
              >
                + Шинэ шилжүүлэг
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3 mt-5">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-2xl px-4 py-3 text-center">
            <div className="text-xl font-bold text-gray-900">
              {typeof stat.value === "string" ? (
                <span className="text-xl font-bold text-gray-900">{stat.value}</span>
              ) : (
                stat.value
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
