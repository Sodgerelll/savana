import "../../admin.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Search, Plus, Building2, User, Store, AlertTriangle, ChevronRight } from "lucide-react";
import type { Customer } from "../../types/crm";
import { MoneyFormat } from "../../components/shared/MoneyFormat";
import { DateFormat } from "../../components/shared/DateFormat";
import { ToastContainer } from "../../components/shared/Toast";

const TYPE_CONFIG = {
  ORGANIZATION: { label: "Байгууллага", bg: "bg-teal-100 text-teal-700", icon: Building2 },
  INDIVIDUAL: { label: "Хувь хүн", bg: "bg-purple-100 text-purple-700", icon: User },
  RETAIL_POINT: { label: "Дэлгүүр", bg: "bg-rose-100 text-rose-700", icon: Store },
};

const CATEGORY_CONFIG = {
  WHOLESALE: "bg-blue-100 text-blue-700",
  RETAIL: "bg-gray-100 text-gray-700",
  VIP: "bg-yellow-100 text-yellow-700",
  REGULAR: "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  WHOLESALE: "Бөөний",
  RETAIL: "Жижиглэн",
  VIP: "VIP",
  REGULAR: "Энгийн",
};

type FilterType = "" | "ORGANIZATION" | "INDIVIDUAL" | "RETAIL_POINT";
type FilterCategory = "" | "WHOLESALE" | "RETAIL" | "VIP" | "REGULAR";

export default function CustomerListPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("");
  const [filterHasDebt, setFilterHasDebt] = useState(false);
  const [filterActive, setFilterActive] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "customers"), orderBy("name")),
      (snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const filtered = customers.filter((c) => {
    if (filterActive && c.isActive === false) return false;
    if (filterType && c.type !== filterType) return false;
    if (filterCategory && c.category !== filterCategory) return false;
    if (filterHasDebt && c.balance <= 0) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !c.name.toLowerCase().includes(s) &&
        !(c.phone ?? "").includes(s) &&
        !(c.registrationNumber ?? "").toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  function getAvatar(customer: Customer) {
    const initials = customer.name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    const bg =
      customer.type === "ORGANIZATION"
        ? "bg-teal-500"
        : customer.type === "INDIVIDUAL"
          ? "bg-purple-500"
          : "bg-rose-500";
    return (
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${bg}`}
      >
        {initials || "?"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Харилцагчид</h1>
            <p className="text-sm text-gray-500 mt-0.5">{filtered.length} харилцагч</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin/customers/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Шинэ харилцагч
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">
        {/* Search & Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Нэр, утас, регистр хайх..."
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Type filter */}
          <div className="flex gap-1.5">
            {[
              { value: "", label: "Бүгд" },
              { value: "ORGANIZATION", label: "Байгууллага" },
              { value: "INDIVIDUAL", label: "Хувь хүн" },
              { value: "RETAIL_POINT", label: "Дэлгүүр" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value as FilterType)}
                className={`px-3 py-2 text-sm rounded-xl transition-colors ${
                  filterType === opt.value
                    ? "bg-green-600 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* More filters */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
            className="border border-gray-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Бүх ангилал</option>
            <option value="WHOLESALE">Бөөний</option>
            <option value="RETAIL">Жижиглэн</option>
            <option value="VIP">VIP</option>
            <option value="REGULAR">Энгийн</option>
          </select>

          <button
            onClick={() => setFilterHasDebt(!filterHasDebt)}
            className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
              filterHasDebt
                ? "bg-red-600 text-white border-red-600"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Өртэй
          </button>

          <button
            onClick={() => setFilterActive(!filterActive)}
            className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
              filterActive
                ? "bg-green-600 text-white border-green-600"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Идэвхтэй
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-white rounded-2xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <div className="text-lg font-medium">Харилцагч олдсонгүй</div>
            <div className="text-sm mt-1">Хайлт эсвэл шүүлтүүрийг өөрчлөн үзнэ үү</div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Нэр</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Ангилал</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Утас</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Өр</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Захиалга</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Сүүлд</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => {
                  const typeConf = TYPE_CONFIG[customer.type];
                  const creditExceeded =
                    customer.creditLimit > 0 && customer.balance > customer.creditLimit;
                  return (
                    <tr
                      key={customer.id}
                      onClick={() => navigate(`/admin/customers/${customer.id}`)}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {getAvatar(customer)}
                          <div>
                            <div className="font-medium text-gray-900">{customer.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {typeConf && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConf.bg}`}>
                                  {typeConf.label}
                                </span>
                              )}
                              {customer.registrationNumber && (
                                <span className="text-xs text-gray-400">
                                  {customer.registrationNumber}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            CATEGORY_CONFIG[customer.category] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {CATEGORY_LABELS[customer.category] ?? customer.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{customer.phone || "—"}</td>
                      <td className="px-4 py-3.5 text-right">
                        {customer.balance > 0 ? (
                          <div className="flex items-center justify-end gap-1">
                            {creditExceeded && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                            )}
                            <MoneyFormat
                              amount={customer.balance}
                              className={`font-semibold ${creditExceeded ? "text-red-600" : "text-red-500"}`}
                            />
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-700">
                        {customer.totalOrders}
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-500">
                        <DateFormat value={customer.lastOrderDate} />
                      </td>
                      <td className="px-4 py-3.5 text-gray-400">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
