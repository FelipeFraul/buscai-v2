type CompanyQualityInput = {
  name?: string | null;
  addressLine?: string | null;
  cityId?: string | null;
  nicheId?: string | null;
  phoneE164?: string | null;
  whatsappE164?: string | null;
};

export const computeQualityScore = (input: CompanyQualityInput): number => {
  let score = 0;

  if (input.name) score += 20;
  if (input.addressLine) score += 10;
  if (input.cityId && input.nicheId) score += 20;
  if (input.phoneE164) score += 20;
  if (input.whatsappE164) score += 30;

  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
};
