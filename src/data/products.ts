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
}

export interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string;
  image: string;
}

export const collections: Collection[] = [
  {
    id: 1,
    name: "Bar Soaps",
    slug: "bar-soaps",
    description: "Handcrafted natural bar soaps made with love on the Canadian prairies.",
    image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&h=400&fit=crop",
  },
  {
    id: 2,
    name: "Body Butters",
    slug: "body-butters",
    description: "Rich, nourishing body butters for deep hydration.",
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600&h=400&fit=crop",
  },
  {
    id: 3,
    name: "Body Sprays",
    slug: "body-sprays",
    description: "Natural body sprays with essential oil blends.",
    image: "https://images.unsplash.com/photo-1594913415176-a99d3e2e1744?w=600&h=400&fit=crop",
  },
  {
    id: 4,
    name: "Hair Care",
    slug: "hair-care",
    description: "Solid conditioner bars and natural hair care products.",
    image: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=600&h=400&fit=crop",
  },
  {
    id: 5,
    name: "Skincare Sets",
    slug: "skincare-sets",
    description: "Curated sets of our best skincare products.",
    image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&h=400&fit=crop",
  },
  {
    id: 6,
    name: "Accessories",
    slug: "accessories",
    description: "Soap dishes, travel boxes, and more.",
    image: "https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=600&h=400&fit=crop",
  },
];

export const products: Product[] = [
  {
    id: 1,
    name: "After Sun Body Spray",
    price: 12.0,
    description: "A soothing body spray perfect for after-sun care. Made with natural ingredients to calm and hydrate your skin.",
    category: "body-sprays",
    images: ["https://images.unsplash.com/photo-1594913415176-a99d3e2e1744?w=500&h=500&fit=crop"],
  },
  {
    id: 2,
    name: "Carrot Pudding Soap",
    price: 13.25,
    description: "A warm, spiced soap inspired by classic carrot pudding. Rich in vitamins and natural moisturizers.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&h=500&fit=crop"],
  },
  {
    id: 3,
    name: "Charcoal & Yarrow Soap",
    price: 13.25,
    description: "Activated charcoal meets wild yarrow in this deeply cleansing bar. Perfect for oily or combination skin.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=500&h=500&fit=crop"],
  },
  {
    id: 4,
    name: "Chore Bar",
    price: 12.0,
    description: "A versatile cleaning bar for dishes, laundry, and general household cleaning. All-natural and effective.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=500&h=500&fit=crop"],
    variants: [
      { name: "With Tin", price: 12.0 },
      { name: "Without Tin", price: 10.0 },
    ],
  },
  {
    id: 5,
    name: "Conditioner Bar - Grapefruit Orange",
    price: 23.95,
    description: "A solid conditioner bar with uplifting grapefruit and orange essential oils. Leaves hair soft and manageable.",
    category: "hair-care",
    images: ["https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=500&h=500&fit=crop"],
  },
  {
    id: 6,
    name: "Conditioner Bar - Rosemary Mint",
    price: 23.95,
    description: "Invigorating rosemary and mint solid conditioner bar. Stimulates the scalp and adds shine.",
    category: "hair-care",
    images: ["https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&h=500&fit=crop"],
  },
  {
    id: 7,
    name: "Dandelion & Honey Soap",
    price: 13.25,
    description: "Gentle and moisturizing soap made with real dandelion-infused oil and local prairie honey.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&h=500&fit=crop"],
  },
  {
    id: 8,
    name: "Essential Skincare Set",
    price: 118.0,
    description: "A complete skincare routine featuring our best-selling products. The perfect gift or self-care treat.",
    category: "skincare-sets",
    images: ["https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=500&h=500&fit=crop"],
    variants: [
      { name: "Small Set", price: 118.0 },
      { name: "Large Set", price: 177.0 },
    ],
    badge: "Best Seller",
  },
  {
    id: 9,
    name: "Eucalyptus Mint Body Butter",
    price: 28.0,
    description: "A rich, whipped body butter infused with eucalyptus and mint essential oils. Deep moisture with a refreshing scent.",
    category: "body-butters",
    images: ["https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&h=500&fit=crop"],
  },
  {
    id: 10,
    name: "Eucalyptus Mint Soap",
    price: 13.25,
    description: "Wake up your senses with this invigorating eucalyptus and mint soap. A spa experience in your shower.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=500&h=500&fit=crop"],
  },
  {
    id: 11,
    name: "Forest Bath Body Spray",
    price: 18.0,
    description: "Immerse yourself in the Canadian forest with this grounding body spray. Notes of pine, cedar, and earth.",
    category: "body-sprays",
    images: ["https://images.unsplash.com/photo-1594913415176-a99d3e2e1744?w=500&h=500&fit=crop"],
  },
  {
    id: 12,
    name: "Forest Bath Soap",
    price: 13.25,
    description: "A woodsy, grounding soap that brings the forest to your bathroom. Made with pine and cedarwood essential oils.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&h=500&fit=crop"],
  },
  {
    id: 13,
    name: "Gardener Bar Soap",
    price: 13.25,
    description: "A hardworking soap for green thumbs. Exfoliating and deodorizing with pumice and essential oils.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=500&h=500&fit=crop"],
  },
  {
    id: 14,
    name: "Goldenrod & Tallow Soap",
    price: 13.25,
    description: "Traditional tallow soap infused with wild goldenrod. Rich, creamy lather with prairie botanicals.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=500&h=500&fit=crop"],
  },
  {
    id: 15,
    name: "Handcrafted Wooden Soap Travel Box",
    price: 40.0,
    description: "A beautiful handcrafted wooden box perfect for traveling with your favorite bar soap. Made from sustainable wood.",
    category: "accessories",
    images: ["https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=500&h=500&fit=crop"],
  },
  {
    id: 16,
    name: "Hard Working Hands Soap",
    price: 13.25,
    description: "Specially formulated for hardworking hands. Deep cleaning with gentle exfoliation and moisturizing oils.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&h=500&fit=crop"],
  },
  {
    id: 17,
    name: "Lavender Oat Soap",
    price: 13.25,
    description: "Calming lavender with soothing colloidal oatmeal. Perfect for sensitive or irritated skin.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=500&h=500&fit=crop"],
  },
  {
    id: 18,
    name: "Lemongrass Soap",
    price: 13.25,
    description: "Bright and energizing lemongrass soap. A fresh, clean scent that uplifts your mood.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=500&h=500&fit=crop"],
  },
  {
    id: 19,
    name: "Rose Clay Facial Bar",
    price: 14.50,
    description: "A gentle facial bar with rose clay and rosehip oil. Cleanses without stripping natural oils.",
    category: "bar-soaps",
    images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?w=500&h=500&fit=crop"],
    badge: "New",
  },
  {
    id: 20,
    name: "Tallow Balm",
    price: 24.0,
    description: "A deeply nourishing tallow-based balm for dry or damaged skin. Simple, traditional, effective.",
    category: "body-butters",
    images: ["https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=500&h=500&fit=crop"],
  },
];
