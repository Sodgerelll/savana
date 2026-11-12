import type { OrderFulfillment } from "./orders";

export interface FulfillmentState {
  /** Whether the basket is large enough to be delivered at all. */
  deliveryAvailable: boolean;
  /** How much more the shopper has to add before delivery opens up. 0 once it has. */
  amountToDelivery: number;
  /** What the order will actually be: the shopper's choice, or pickup below the minimum. */
  fulfillment: OrderFulfillment;
}

/**
 * Delivery or pickup for a basket. Below the shop's delivery minimum only pickup is
 * possible, whatever was chosen; from the minimum on, the shopper's choice stands.
 *
 * `minOrderForDelivery` comes from the shop settings, where 0 means the shop delivers
 * any order — so with it at 0 delivery is always open. Mirrors the server's pricing in
 * api/_lib/orderPricing.ts.
 */
export function resolveFulfillment(
  itemsSubtotal: number,
  minOrderForDelivery: number,
  choice: OrderFulfillment,
): FulfillmentState {
  const deliveryAvailable = minOrderForDelivery <= 0 || itemsSubtotal >= minOrderForDelivery;
  return {
    deliveryAvailable,
    amountToDelivery: Math.max(0, minOrderForDelivery - itemsSubtotal),
    fulfillment: deliveryAvailable ? choice : "pickup",
  };
}
