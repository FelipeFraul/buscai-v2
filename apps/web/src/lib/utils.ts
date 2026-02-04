const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export const cn = (...classes: Array<string | undefined | false | null>) =>
  classes.filter(Boolean).join(" ");

export const formatCurrencyFromCents = (valueInCents?: number | null) =>
  currencyFormatter.format((valueInCents ?? 0) / 100);
