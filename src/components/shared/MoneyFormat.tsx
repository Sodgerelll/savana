/* eslint-disable react-refresh/only-export-components */
interface MoneyFormatProps {
  amount: number;
  className?: string;
}

export function MoneyFormat({ amount, className }: MoneyFormatProps) {
  const formatted = new Intl.NumberFormat("mn-MN").format(Math.abs(Math.round(amount)));
  const isNegative = amount < 0;
  return (
    <span className={className}>
      {isNegative ? "-" : ""}
      {formatted}₮
    </span>
  );
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("mn-MN").format(Math.round(amount)) + "₮";
}
