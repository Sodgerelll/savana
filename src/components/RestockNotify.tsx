import { useState, type FormEvent } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { createContactMessage } from "../lib/contactMessages";

/**
 * "Let me know when it's back" for a sold-out product. The request lands in the
 * admin Messages inbox as an ordinary contact message, so there is nothing new
 * for the shop to watch and no new collection to secure.
 */
export default function RestockNotify({ productName, variant }: { productName: string; variant?: string }) {
  const { language } = useLanguage();
  const { user, profile } = useAuth();
  const mn = language === "MN";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => profile?.displayName ?? "");
  const [contact, setContact] = useState(() => profile?.phoneNumber ?? profile?.email ?? user?.email ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const itemLabel = variant ? `${productName} (${variant})` : productName;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || contact.trim().length < 4) return;
    setStatus("sending");
    try {
      await createContactMessage({
        name,
        // The inbox column is "email", but a phone number is what most shoppers
        // here leave — the rules only require some way to reach them.
        email: contact,
        subject: `Нөөц ирэхэд мэдэгдэх: ${itemLabel}`.slice(0, 160),
        message: `"${itemLabel}" бүтээгдэхүүн дахин ирэхэд ${contact} руу мэдэгдэнэ үү.`,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <p className="pd-restock-done">
        {mn
          ? "Баярлалаа! Бараа ирмэгц тантай холбогдоно."
          : "Thanks! We'll let you know as soon as it's back."}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-outline pd-restock-btn" onClick={() => setOpen(true)}>
        <Bell size={16} strokeWidth={1.6} /> {mn ? "Ирэхэд мэдэгдэл авах" : "Notify me when available"}
      </button>
    );
  }

  return (
    <form className="pd-restock-form" onSubmit={handleSubmit}>
      <p>
        {mn
          ? "Бараа дахин ирэхэд бид тантай холбогдоно."
          : "Leave your details and we'll tell you when it's back."}
      </p>
      <input
        type="text"
        value={name}
        maxLength={120}
        placeholder={mn ? "Таны нэр" : "Your name"}
        aria-label={mn ? "Таны нэр" : "Your name"}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        type="text"
        value={contact}
        maxLength={160}
        placeholder={mn ? "Утас эсвэл и-мэйл" : "Phone or email"}
        aria-label={mn ? "Утас эсвэл и-мэйл" : "Phone or email"}
        onChange={(event) => setContact(event.target.value)}
        required
        minLength={4}
      />
      {status === "error" && (
        <p className="pd-restock-error">
          {mn ? "Илгээж чадсангүй. Дахин оролдоно уу." : "Could not send. Please try again."}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
        {status === "sending" ? (mn ? "Илгээж байна..." : "Sending...") : mn ? "Мэдэгдэл авах" : "Notify me"}
      </button>
    </form>
  );
}
