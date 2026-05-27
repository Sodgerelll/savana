import { useState } from "react";
import {
  ShoppingCart,
  CreditCard,
  RotateCcw,
  Tag,
  MessageSquare,
  Info,
  Package,
  Plus,
} from "lucide-react";
import type { TimelineEventType } from "../../types/crm";
import { useCustomerTimeline } from "../../hooks/useCustomerTimeline";
import { addTimelineNote } from "../../services/transferService";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { toast } from "../shared/Toast";
import { useAuth } from "../../context/AuthContext";

interface Props {
  customerId: string;
}

const TYPE_CONFIG: Record<
  TimelineEventType,
  { icon: React.ReactNode; dotColor: string; bgColor: string }
> = {
  TRANSFER_CREATED: {
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-50",
  },
  TRANSFER_CONFIRMED: {
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    dotColor: "bg-blue-600",
    bgColor: "bg-blue-50",
  },
  TRANSFER_SHIPPED: {
    icon: <Package className="w-3.5 h-3.5" />,
    dotColor: "bg-blue-400",
    bgColor: "bg-blue-50",
  },
  TRANSFER_DELIVERED: {
    icon: <Package className="w-3.5 h-3.5" />,
    dotColor: "bg-green-600",
    bgColor: "bg-green-50",
  },
  TRANSFER_CANCELLED: {
    icon: <ShoppingCart className="w-3.5 h-3.5" />,
    dotColor: "bg-red-500",
    bgColor: "bg-red-50",
  },
  PAYMENT_RECEIVED: {
    icon: <CreditCard className="w-3.5 h-3.5" />,
    dotColor: "bg-green-500",
    bgColor: "bg-green-50",
  },
  RETURN_CREATED: {
    icon: <RotateCcw className="w-3.5 h-3.5" />,
    dotColor: "bg-red-500",
    bgColor: "bg-red-50",
  },
  PRICE_CHANGED: {
    icon: <Tag className="w-3.5 h-3.5" />,
    dotColor: "bg-yellow-500",
    bgColor: "bg-yellow-50",
  },
  NOTE_ADDED: {
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    dotColor: "bg-gray-400",
    bgColor: "bg-gray-50",
  },
  INFO_UPDATED: {
    icon: <Info className="w-3.5 h-3.5" />,
    dotColor: "bg-gray-400",
    bgColor: "bg-gray-50",
  },
};

export function TimelineTab({ customerId }: Props) {
  const { events, loading } = useCustomerTimeline(customerId, 100);
  const { profile } = useAuth();
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  async function handleAddNote() {
    if (!note.trim()) return;
    setAddingNote(true);
    try {
      await addTimelineNote(
        customerId,
        note.trim(),
        profile?.uid ?? "",
        profile?.displayName ?? ""
      );
      setNote("");
      toast("Тэмдэглэл нэмэгдлээ", "success");
    } catch {
      toast("Алдаа гарлаа", "error");
    } finally {
      setAddingNote(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Add Note */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Тэмдэглэл нэмэх</label>
        <div className="flex gap-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Тэмдэглэл бичих..."
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
          <button
            type="button"
            onClick={handleAddNote}
            disabled={addingNote || !note.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors self-start flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Нэмэх
          </button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Бүртгэл байхгүй
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />

          <div className="space-y-4">
            {events.map((event) => {
              const config = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.NOTE_ADDED;
              return (
                <div key={event.id} className="flex gap-4 relative">
                  {/* Dot */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 text-white ${config.dotColor}`}
                  >
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 rounded-2xl px-4 py-3 ${config.bgColor} min-w-0`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{event.title}</div>
                        {event.description && (
                          <div className="text-sm text-gray-600 mt-0.5 break-words">
                            {event.description}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                          <DateFormat value={event.createdAt} showTime />
                          {event.createdByName && (
                            <>
                              <span>·</span>
                              <span>{event.createdByName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {event.amount !== null && event.amount !== undefined && (
                        <div className="shrink-0">
                          <MoneyFormat
                            amount={event.amount}
                            className="text-sm font-semibold text-gray-800"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
