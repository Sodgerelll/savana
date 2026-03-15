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

  const addItem = (product: Product, quantity = 1, variant?: string) => {
    const unitPrice = getUnitPrice(product, variant);

    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && item.variant === variant);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id && item.variant === variant
            ? { ...item, quantity: item.quantity + quantity, unitPrice }
            : item
        );
      }
      return [...prev, { product, quantity, variant, unitPrice }];
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
      prev.map((item) =>
        item.product.id === productId && item.variant === variant ? { ...item, quantity } : item
      )
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
