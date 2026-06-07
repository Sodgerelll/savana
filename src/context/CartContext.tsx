/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Product } from "../data/products";

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: string;
  unitPrice: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, variant?: string) => void;
  removeItem: (productId: number, variant?: string) => void;
  updateQuantity: (productId: number, quantity: number, variant?: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const getUnitPrice = (product: Product, variant?: string) =>
    variant ? product.variants?.find((item) => item.name === variant)?.price ?? product.price : product.price;

  // Available remaining stock = on-hand minus already-sold. Cart quantities are
  // capped to this so customers can never order more than is in stock.
  const getRemainingStock = (product: Product, variant?: string) => {
    if (variant && product.variants?.length) {
      const v = product.variants.find((item) => item.name === variant);
      return Number(v?.quantity ?? 0) - Number(v?.soldCount ?? 0);
    }
    return Number(product.totalStock ?? 0) - Number(product.soldCount ?? 0);
  };

  const addItem = (product: Product, quantity = 1, variant?: string) => {
    const unitPrice = getUnitPrice(product, variant);
    const remaining = getRemainingStock(product, variant);

    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.variant === variant);
      const currentQty = existing?.quantity ?? 0;
      const addQty = Math.min(quantity, Math.max(0, remaining - currentQty));
      if (addQty <= 0) {
        // Already at the stock ceiling — nothing to add.
        return prev;
      }
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.variant === variant
            ? { ...item, quantity: item.quantity + addQty, unitPrice }
            : item
        );
      }
      return [...prev, { product, quantity: addQty, variant, unitPrice }];
    });
    setIsCartOpen(true);
  };

  const removeItem = (productId: number, variant?: string) => {
    setItems((prev) => prev.filter((item) => !(item.product.id === productId && item.variant === variant)));
  };

  const updateQuantity = (productId: number, quantity: number, variant?: string) => {
    if (quantity <= 0) {
      removeItem(productId, variant);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.product.id === productId && item.variant === variant) {
          // Never exceed available stock (keep at least 1 to stay in cart).
          const remaining = getRemainingStock(item.product, variant);
          const capped = Math.max(1, Math.min(quantity, remaining));
          return { ...item, quantity: capped };
        }
        return item;
      })
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, isCartOpen, setIsCartOpen }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
