interface NatureIconProps {
  size?: number;
  strokeWidth?: number;
}

// ── Feature Badge Icons ──────────────────────────────────────────────

// Botanical leaf with veins — Natural Herbs & Oils
export const DrawLeafIcon = ({ size = 24, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Outer leaf shape — organic curve, asymmetric */}
    <path d="M7 27 C7 27 4 19 5.5 12.5 C7 7 12 3.5 18 4 C23 4.5 27.5 8.5 27 14 C26.5 20 21.5 26 15.5 28.5 C11.5 30 7 27 7 27 Z" />
    {/* Central vein */}
    <path d="M7 27 C11 22 17 15 23.5 8" />
    {/* Left-side veins */}
    <path d="M10 23 C12.5 20 16 19 18.5 17.5" />
    <path d="M9 18 C11.5 15.5 15 14.5 17 13" />
    <path d="M10.5 13 C12.5 11 15 10.5 16.5 9" />
    {/* Tiny curled tip */}
    <path d="M23.5 8 C24 7 24.5 6.5 24 5.5" />
  </svg>
);

// Mortar and pestle with herb sprigs — Handmade in Small Batches
export const DrawHandmadeIcon = ({ size = 24, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Mortar bowl */}
    <path d="M5 14 Q5 24.5 16 24.5 Q27 24.5 27 14 Z" />
    {/* Rim */}
    <path d="M3 14 L29 14" />
    {/* Base foot */}
    <path d="M10 24.5 L10 27.5 L22 27.5 L22 24.5" />
    {/* Pestle handle */}
    <path d="M20 12 C22 10 25.5 7.5 27.5 5.5" />
    {/* Pestle tip (rounded end) */}
    <path d="M27.5 5.5 C28.5 4.5 30 4.5 29.5 3" />
    {/* Pestle body inside bowl */}
    <path d="M16 14 C17.5 13.5 19 12.5 20 12" />
    {/* Herb leaf 1 */}
    <path d="M6 12.5 C5.5 11 6.5 9.5 8 9.5 C8.5 11 7.5 12.5 6 12.5 Z" />
    {/* Herb leaf 2 */}
    <path d="M9.5 11.5 C9 10 10 8.5 11.5 9 C11.5 10.5 10.5 12 9.5 11.5 Z" />
    {/* Stem connecting herbs */}
    <path d="M6 12.5 C7.5 13 9 12.5 9.5 11.5" />
  </svg>
);

// Five-petal botanical flower — Great for Sensitive Skin
export const DrawFlowerIcon = ({ size = 24, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Center circle */}
    <circle cx="16" cy="15" r="3.5" />
    {/* Petal top */}
    <path d="M16 4 C14 4 13 9.5 16 12.5 C19 9.5 18 4 16 4 Z" />
    {/* Petal upper-right */}
    <path d="M25.5 8.5 C23.5 7 19.5 10.5 20.5 14 C23.5 14.5 26.5 11 25.5 8.5 Z" />
    {/* Petal lower-right */}
    <path d="M24 23 C24 20.5 20 18.5 18 20 C18 23 21 25 24 23 Z" />
    {/* Petal lower-left */}
    <path d="M8 23 C11 25 14 23 14 20 C12 18.5 8 20.5 8 23 Z" />
    {/* Petal upper-left */}
    <path d="M6.5 8.5 C5.5 11 8.5 14.5 11.5 14 C12.5 10.5 9 7 6.5 8.5 Z" />
    {/* Stem */}
    <path d="M16 29 C15.5 26 15.5 22 16 18.5" />
    {/* Left leaf on stem */}
    <path d="M16 26 C16 26 13 25 12 23.5" />
    {/* Right leaf on stem */}
    <path d="M16 24 C16 24 19 23 20 21.5" />
  </svg>
);

// 3-D package box — Nationwide Delivery
export const DrawBoxIcon = ({ size = 24, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Front face */}
    <path d="M4 14 L4 27 L22 27 L22 14 Z" />
    {/* Top face */}
    <path d="M4 14 L9.5 8 L27.5 8 L22 14 Z" />
    {/* Right side face */}
    <path d="M22 14 L27.5 8 L27.5 22 L22 27 Z" />
    {/* Tape strip on top */}
    <path d="M13 8 L13 14" />
    {/* Tape strip on front */}
    <path d="M13 14 L13 27" />
    {/* Bow left loop */}
    <path d="M11 11 C10 9.5 12 8.5 13 10.5" />
    {/* Bow right loop */}
    <path d="M15 11 C16 9.5 14 8.5 13 10.5" />
  </svg>
);

// Hourglass with botanical frame — Shelf Life (Хадгалах хугацаа)
export const DrawShelfLifeIcon = ({ size = 24, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Top bar with small leaf ends */}
    <path d="M6 4 C6 4 8 3 16 3 C24 3 26 4 26 4" />
    {/* Bottom bar with small leaf ends */}
    <path d="M6 28 C6 28 8 29 16 29 C24 29 26 28 26 28" />
    {/* Left silhouette — curves inward at waist */}
    <path d="M6 4 C6 4 11 10 11 16 C11 22 6 28 6 28" />
    {/* Right silhouette */}
    <path d="M26 4 C26 4 21 10 21 16 C21 22 26 28 26 28" />
    {/* Waist line */}
    <path d="M11 16 L21 16" />
    {/* Sand collected at bottom — curved fill shape */}
    <path d="M8 25 Q16 21 24 25" />
    {/* Sand trickle falling */}
    <path d="M16 16 C16 17.5 16 19 16 20" />
    {/* Small leaf decoration on top-left corner */}
    <path d="M5 5 C4 4 3.5 2.5 5 2.5 C6 3 5.5 4.5 5 5 Z" />
    {/* Small leaf decoration on top-right corner */}
    <path d="M27 5 C28 4 28.5 2.5 27 2.5 C26 3 26.5 4.5 27 5 Z" />
  </svg>
);

// ── Accordion Icons ──────────────────────────────────────────────────

// Branching herb plant — Ingredients (Найрлага)
export const DrawHerbsIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21 L12 10" />
    <path d="M12 18 C10.5 18 8 16.5 7 14.5 C8.5 13.5 11 14 12 16" />
    <path d="M12 14.5 C13.5 14.5 16 13 17 11 C15.5 10 13 10.5 12 12.5" />
    <path d="M12 11 C10.5 11 8 9.5 7 7.5 C8.5 6.5 11 7 12 9" />
    <path d="M10 21 L14 21" />
  </svg>
);

// 8-pointed botanical star — Usage / Benefits (Үйлчилгээ)
export const DrawStarIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 L13.2 9 L20 7 L15.5 12 L20 17 L13.2 15 L12 22 L10.8 15 L4 17 L8.5 12 L4 7 L10.8 9 Z" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

// Open book with page lines — How to Use (Заавар)
export const DrawBookIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Left page */}
    <path d="M4 20 C4 19 4 5 4 4.5 C4 3.5 5 3 6 3 L11 3 L11 21 L6 21 C5 21 4 20.5 4 20 Z" />
    {/* Right page */}
    <path d="M20 20 C20 19 20 5 20 4.5 C20 3.5 19 3 18 3 L13 3 L13 21 L18 21 C19 21 20 20.5 20 20 Z" />
    {/* Spine */}
    <path d="M11 3 C11.5 5 12.5 5 13 3" />
    <path d="M11 21 C11.5 19 12.5 19 13 21" />
    {/* Left page lines */}
    <path d="M6.5 8 L9.5 8" />
    <path d="M6.5 11 L9.5 11" />
    <path d="M6.5 14 L9.5 14" />
    {/* Right page lines */}
    <path d="M14.5 8 L17.5 8" />
    <path d="M14.5 11 L17.5 11" />
    <path d="M14.5 14 L17.5 14" />
  </svg>
);

// Organic warning triangle — Caution (Анхааруулга)
export const DrawAlertIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3 C12 3 22 20 22 21 C22 21 2 21 2 21 C2 21 12 3 12 3 Z" />
    <path d="M12 10 L12 15" />
    <path d="M12 17.5 L12 18.5" strokeWidth="2" />
  </svg>
);

// Hourglass with sand — Shelf Life (Хугацаа)
export const DrawHourglassIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Top and bottom bars */}
    <path d="M5 2 L19 2" />
    <path d="M5 22 L19 22" />
    {/* Left silhouette */}
    <path d="M5 2 C5 2 10 9 10 12 C10 15 5 22 5 22" />
    {/* Right silhouette */}
    <path d="M19 2 C19 2 14 9 14 12 C14 15 19 22 19 22" />
    {/* Waist lines */}
    <path d="M10 12 L14 12" />
    {/* Sand in bottom */}
    <path d="M7.5 19 Q12 17 16.5 19" />
    {/* Sand grain falling */}
    <path d="M12 12.5 L12 14" />
  </svg>
);

// Illustrated delivery truck — Shipping (Хүргэлт)
export const DrawTruckIcon = ({ size = 16, strokeWidth = 1.4 }: NatureIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {/* Cargo body */}
    <path d="M2 8 L2 18 L15 18 L15 8 Z" />
    {/* Cab */}
    <path d="M15 18 L15 11 C15 9.5 15.5 9 17 9 L21 9 C22 9 22.5 9.5 22.5 11 L22.5 18 Z" />
    {/* Cab window */}
    <path d="M16.5 9.5 L16.5 13.5 L21.5 13.5 L21.5 9.5" />
    {/* Front wheel */}
    <circle cx="19" cy="18" r="2.5" />
    {/* Rear wheel */}
    <circle cx="6" cy="18" r="2.5" />
    {/* Ground */}
    <path d="M2 18 L16.5 18" />
  </svg>
);
