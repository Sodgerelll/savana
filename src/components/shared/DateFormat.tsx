/* eslint-disable react-refresh/only-export-components */
import type { Timestamp } from "firebase/firestore";

interface DateFormatProps {
  value: Timestamp | Date | string | null | undefined;
  showTime?: boolean;
  className?: string;
}

function toDate(value: Timestamp | Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (typeof value === "object" && "toDate" in value) return (value as Timestamp).toDate();
  return null;
}

export function DateFormat({ value, showTime = false, className }: DateFormatProps) {
  const date = toDate(value);
  if (!date) return <span className={className}>—</span>;

  const formatted = date.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const time = showTime
    ? " " + date.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" })
    : "";

  return <span className={className}>{formatted}{time}</span>;
}

export function formatDate(value: Timestamp | Date | string | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
