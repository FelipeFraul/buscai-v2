export interface PublicSearchResult {
  companyId: string;
  empresa: string;
  produto: string;
  posicao: number;
  tipo: "leilao" | "organico" | "oferecido";
}

export interface PublicSearchResponse {
  searchId: string;
  results: PublicSearchResult[];
  offeredBy?: {
    text: string;
    imageUrl?: string;
    website?: string;
    promotionsUrl?: string;
    phoneE164?: string;
    whatsappE164?: string;
    configId?: string;
    companyId?: string;
  };
}
