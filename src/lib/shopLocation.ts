/**
 * Where SAVANA is, for the contact page's map and for shoppers collecting an order
 * themselves. One place, so the pin a shopper is sent to pick up from is the pin the
 * contact page shows.
 */
export const SHOP_COORDINATES = { lat: 47.9167711, lng: 106.939625 } as const;

const coords = `${SHOP_COORDINATES.lat},${SHOP_COORDINATES.lng}`;

/** Embeddable map centred on the shop. */
export const SHOP_MAP_EMBED_SRC = `https://maps.google.com/maps?q=${coords}&z=17&output=embed`;

/** Opens the shop in Google Maps (the app on a phone), ready for directions. */
export const SHOP_MAP_LINK = `https://www.google.com/maps/search/?api=1&query=${coords}`;

/** Opening hours, as the contact page states them. */
export const SHOP_HOURS = {
  MN: { weekdays: "Да – Ба", weekdaysTime: "09:00 – 18:00", weekend: "Бя – Ня", weekendTime: "Амарна" },
  EN: { weekdays: "Mon – Fri", weekdaysTime: "09:00 – 18:00", weekend: "Sat – Sun", weekendTime: "Closed" },
} as const;
