export type CompanyOverview = {
  company: {
    id: string;
    tradeName: string;
    legalName?: string;
    city?: { id: string; name: string; state: string; isActive?: boolean };
    niches: Array<{ id?: string; label?: string; slug?: string; isActive?: boolean }>;
    status?: string;
    channels?: {
      phone?: string;
      whatsapp?: string;
      address?: string;
      openingHours?: string;
      latitude?: number;
      longitude?: number;
    };
    createdAt?: string;
  };
  billing: {
    wallet: { balanceCents: number; reservedCents: number };
  };
  products: {
    activeOffers: number;
  };
  auction: {
    activeConfigs: number;
  };
};
