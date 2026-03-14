export type EntityStatus = "active" | "inactive";

export interface Product {
  id: number;
  name: string;
  price: number;
  compareAtPrice?: number;
  description: string;
  category: string;
  images: string[];
  variants?: { name: string; price: number }[];
  badge?: string;
  bestSeller?: boolean;
  status: EntityStatus;
}

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string;
  gradient: string;
  image: string;
  status: EntityStatus;
}

export const collections: Collection[] = [
  {
    id: 1,
    name: "All Natural Soap",
    slug: "soap",
    description: "Handcrafted natural bar soaps made with love on the Canadian prairies.",
    gradient: "linear-gradient(135deg, #c8bfa8 0%, #b5a98e 100%)",
    image: "",
    status: "active",
  },
  {
    id: 2,
    name: "Skin Care",
    slug: "skin-care",
    description: "Natural skincare formulated with wildcrafted botanicals and essential oils.",
    gradient: "linear-gradient(135deg, #d4c9b0 0%, #c2b49a 100%)",
    image: "",
    status: "active",
  },
  {
    id: 3,
    name: "Body Care",
    slug: "body-care",
    description: "Rich, nourishing body care products for deep hydration.",
    gradient: "linear-gradient(135deg, #bfc8aa 0%, #aab592 100%)",
    image: "",
    status: "active",
  },
  {
    id: 4,
    name: "Hair",
    slug: "hair",
    description: "Natural hair care crafted with prairie botanicals.",
    gradient: "linear-gradient(135deg, #c4bda8 0%, #b0a890 100%)",
    image: "",
    status: "active",
  },
  {
    id: 5,
    name: "Lip Care",
    slug: "lip-care",
    description: "Nourishing lip balms made with natural waxes and botanical oils.",
    gradient: "linear-gradient(135deg, #d0c0b0 0%, #bda898 100%)",
    image: "",
    status: "active",
  },
  {
    id: 6,
    name: "Best Sellers",
    slug: "best-sellers",
    description: "Our most-loved products, tried and trusted by the prairie community.",
    gradient: "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)",
    image: "",
    status: "active",
  },
];

export const products: Product[] = [
  // Soap
  {
    id: 1,
    name: "Eucalyptus Mint Soap",
    price: 13.25,
    description:
      "Wake up your senses with this invigorating eucalyptus and mint soap. A spa experience in your daily shower. Made with saponified oils and pure essential oils.",
    category: "soap",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 2,
    name: "Goldenrod & Tallow Soap",
    price: 13.25,
    description:
      "Traditional tallow soap infused with wild goldenrod harvested from the Alberta prairies. Rich, creamy lather with prairie botanicals.",
    category: "soap",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 3,
    name: "Wild Rose Hip Soap",
    price: 13.25,
    description:
      "A delicate, nourishing soap crafted with wild rose hip oil and botanicals. Gentle on skin with a light floral scent.",
    category: "soap",
    images: [""],
    status: "active",
  },
  {
    id: 4,
    name: "Saskatoon Berry Soap",
    price: 13.25,
    description:
      "Prairie-inspired soap featuring the beloved Saskatoon berry. Packed with antioxidants and naturally moisturizing.",
    category: "soap",
    images: [""],
    status: "active",
  },
  {
    id: 5,
    name: "Charcoal & Yarrow Soap",
    price: 13.25,
    description:
      "Activated charcoal meets wild yarrow in this deeply cleansing bar. Perfect for oily or combination skin.",
    category: "soap",
    images: [""],
    status: "active",
  },
  {
    id: 6,
    name: "Lavender Milk Soap",
    price: 13.25,
    description:
      "Calming lavender with nourishing milk creates this soothing, luxurious bar. Perfect for sensitive or dry skin.",
    category: "soap",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 7,
    name: "Dandelion & Honey Soap",
    price: 13.25,
    description:
      "Gentle and moisturizing soap made with real dandelion-infused oil and local prairie honey. A true prairie original.",
    category: "soap",
    images: [""],
    status: "active",
  },
  {
    id: 8,
    name: "Forest Bath Soap",
    price: 13.25,
    description:
      "A woodsy, grounding soap that brings the forest to your bathroom. Made with pine and cedarwood essential oils.",
    category: "soap",
    images: [""],
    status: "active",
  },
  // Skin Care
  {
    id: 9,
    name: "Rejuvenate Face Serum",
    price: 58.0,
    description:
      "A potent face serum formulated with wildcrafted botanicals to rejuvenate and restore your skin's natural glow.",
    category: "skin-care",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 10,
    name: "Refresh Face Toner",
    price: 44.0,
    description:
      "A balancing face toner made with botanical extracts to refresh and prep your skin for the day ahead.",
    category: "skin-care",
    images: [""],
    status: "active",
  },
  {
    id: 11,
    name: "Restorative Face Cream",
    price: 34.0,
    description:
      "A rich, deeply nourishing face cream that restores moisture and supports healthy skin barrier function.",
    category: "skin-care",
    images: [""],
    status: "active",
  },
  {
    id: 12,
    name: "Renew Oil Cleanser",
    price: 36.0,
    description:
      "A gentle oil cleanser that effectively removes makeup and impurities while nourishing the skin.",
    category: "skin-care",
    images: [""],
    status: "active",
  },
  {
    id: 13,
    name: "Essential Skincare Set",
    price: 118.0,
    description:
      "A complete skincare routine featuring our best-selling products. The perfect gift or self-care treat.",
    category: "skin-care",
    images: [""],
    badge: "Best Seller",
    bestSeller: true,
    status: "active",
  },
  {
    id: 14,
    name: "Replenish Eye Serum",
    price: 28.0,
    description:
      "A targeted eye serum to replenish and brighten the delicate skin around the eyes.",
    category: "skin-care",
    images: [""],
    status: "active",
  },
  // Body Care
  {
    id: 15,
    name: "Prairie Gold Balm",
    price: 27.5,
    description:
      "A multi-use healing balm made with prairie-sourced ingredients. Soothes and protects dry, cracked skin.",
    category: "body-care",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 16,
    name: "Pine Resin Salve",
    price: 16.0,
    description:
      "Traditional pine resin salve with powerful healing properties. A prairie staple for cuts, scrapes, and dry skin.",
    category: "body-care",
    images: [""],
    status: "active",
  },
  {
    id: 17,
    name: "White Spruce Body Butter",
    price: 28.0,
    description:
      "A rich, whipped body butter infused with white spruce. Deep moisture with a fresh, woodsy scent.",
    category: "body-care",
    images: [""],
    status: "active",
  },
  {
    id: 18,
    name: "Eucalyptus Mint Body Butter",
    price: 28.0,
    description:
      "A refreshing body butter with eucalyptus and mint essential oils. Deeply moisturizing with an invigorating scent.",
    category: "body-care",
    images: [""],
    status: "active",
  },
  {
    id: 19,
    name: "Sage Foot Balm",
    price: 22.0,
    description:
      "A soothing foot balm with sage and nourishing botanicals. Perfect for tired, dry feet after a long day.",
    category: "body-care",
    images: [""],
    status: "active",
  },
  {
    id: 20,
    name: "Forest Bath Body Spray",
    price: 18.0,
    description:
      "Immerse yourself in the Canadian forest with this grounding body spray. Notes of pine, cedar, and earth.",
    category: "body-care",
    images: [""],
    status: "active",
  },
  // Hair
  {
    id: 21,
    name: "Shampoo Bar Rosemary Mint",
    price: 21.95,
    description:
      "Invigorating rosemary and mint solid shampoo bar. Cleanses gently while stimulating the scalp for healthy hair.",
    category: "hair",
    images: [""],
    bestSeller: true,
    status: "active",
  },
  {
    id: 22,
    name: "Conditioner Bar Rosemary Mint",
    price: 23.95,
    description:
      "Invigorating rosemary and mint solid conditioner bar. Stimulates the scalp and adds shine to every strand.",
    category: "hair",
    images: [""],
    status: "active",
  },
  {
    id: 23,
    name: "Prairie Man Bar 3-in-1",
    price: 13.25,
    description:
      "The ultimate all-in-one bar for the prairie man. Works as shampoo, conditioner, and body wash. Rugged and natural.",
    category: "hair",
    images: [""],
    status: "active",
  },
  // Lip Care
  {
    id: 24,
    name: "Rose Hip Lip Balm",
    price: 12.0,
    description:
      "Our best-selling lip balm made with wild rose hip oil. Deeply nourishing and long-lasting moisture for dry lips.",
    category: "lip-care",
    images: [""],
    badge: "Best Seller",
    bestSeller: true,
    status: "active",
  },
  {
    id: 25,
    name: "Wild Mint Lip Balm",
    price: 12.0,
    description:
      "A refreshing lip balm with wild mint essential oil. Cooling and nourishing for a fresh, smooth pout.",
    category: "lip-care",
    images: [""],
    status: "active",
  },
  {
    id: 26,
    name: "Raspberry Vanilla Lip Balm",
    price: 12.0,
    description:
      "A delicious raspberry and vanilla lip balm. Moisturizing and subtly sweet for lips that stay soft all day.",
    category: "lip-care",
    images: [""],
    status: "active",
  },
  {
    id: 27,
    name: "Peony Lip Balm",
    price: 12.0,
    description:
      "A delicate peony-scented lip balm. Lightweight and nourishing with a beautiful floral note.",
    category: "lip-care",
    images: [""],
    status: "active",
  },
  {
    id: 28,
    name: "Lip Balm Four-Pack",
    price: 40.0,
    description:
      "Save with our popular four-pack of lip balms. Mix and match your favorite scents for the perfect gift or personal collection.",
    category: "lip-care",
    images: [""],
    badge: "Save",
    status: "active",
  },
];

export const bestSellerProducts = products.filter((p) => p.bestSeller).slice(0, 4);
