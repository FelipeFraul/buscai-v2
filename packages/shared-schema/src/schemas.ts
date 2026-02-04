import { z } from "zod";

// =====================
// AUTH
// =====================

export const AuthLoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type AuthLoginInput = z.infer<typeof AuthLoginInputSchema>;

export const AuthRefreshInputSchema = z.object({
  refreshToken: z.string(),
});
export type AuthRefreshInput = z.infer<typeof AuthRefreshInputSchema>;

export const AuthLoginResponseSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  user: z
    .object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      role: z.enum(["admin", "owner"]).optional(),
      createdAt: z.string().optional(),
    })
    .optional(),
});
export type AuthLoginResponse = z.infer<typeof AuthLoginResponseSchema>;

export const AuthRefreshResponseSchema = z.object({
  accessToken: z.string().optional(),
});
export type AuthRefreshResponse = z.infer<typeof AuthRefreshResponseSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "owner"]).optional(),
  createdAt: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

// =====================
// CATALOG
// =====================

export const CitySchema = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  isActive: z.boolean().optional(),
});
export type City = z.infer<typeof CitySchema>;

export const NicheSchema = z.object({
  id: z.string(),
  label: z.string(),
  slug: z.string(),
  isActive: z.boolean().optional(),
});
export type Niche = z.infer<typeof NicheSchema>;

export const CitiesQuerySchema = z.object({
  q: z.string().optional(),
});
export type CitiesQuery = z.infer<typeof CitiesQuerySchema>;

export const NichesQuerySchema = z.object({
  cityId: z.string().optional(),
});
export type NichesQuery = z.infer<typeof NichesQuerySchema>;

// =====================
// COMPANIES
// =====================

export const CompanyChannelsSchema = z.object({
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  openingHours: z.string().optional(),
});
export type CompanyChannels = z.infer<typeof CompanyChannelsSchema>;

export const CompanyChannelsInputSchema = CompanyChannelsSchema;
export type CompanyChannelsInput = z.infer<typeof CompanyChannelsInputSchema>;

export const CompanySchema = z.object({
  id: z.string(),
  tradeName: z.string(),
  legalName: z.string().nullable().optional(),
  cityId: z.string().optional(),
  ownerId: z.string().optional(),
  city: CitySchema.optional(),
  niches: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().optional(),
        slug: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
  channels: CompanyChannelsSchema.optional(),
  createdAt: z.string().optional(),
});
export type Company = z.infer<typeof CompanySchema>;

export const CompanyCreateInputSchema = z.object({
  tradeName: z.string(),
  legalName: z.string().optional(),
  cityId: z.string(),
  nicheIds: z.array(z.string()).optional(),
  channels: CompanyChannelsSchema.optional(),
});
export type CompanyCreateInput = z.infer<typeof CompanyCreateInputSchema>;

export const CompanyUpdateInputSchema = z.object({
  tradeName: z.string().optional(),
  legalName: z.string().optional(),
  nicheIds: z.array(z.string()).optional(),
});
export type CompanyUpdateInput = z.infer<typeof CompanyUpdateInputSchema>;

export const CompanyClaimInputSchema = z.object({
  proofType: z.enum(["sms", "email", "document"]),
  proofValue: z.string(),
});
export type CompanyClaimInput = z.infer<typeof CompanyClaimInputSchema>;

export const CompanyIdParamSchema = z.object({
  companyId: z.string(),
});
export type CompanyIdParam = z.infer<typeof CompanyIdParamSchema>;

export const CompaniesQuerySchema = z.object({
  q: z.string().optional(),
  cityId: z.string().optional(),
  nicheId: z.string().optional(),
  status: z.enum(["pending", "active", "suspended"]).optional(),
});
export type CompaniesQuery = z.infer<typeof CompaniesQuerySchema>;

export const PaginatedCompaniesSchema = z.object({
  items: z.array(CompanySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PaginatedCompanies = z.infer<typeof PaginatedCompaniesSchema>;

// =====================
// AUCTION
// =====================

const BID_STEP_CENTS = 50;

const AuctionBidValueSchema = z
  .number()
  .int()
  .min(0)
  .refine((value) => value % BID_STEP_CENTS === 0, {
    message: "bid must be multiple of 50 cents",
  });

export const AuctionBidsSchema = z.object({
  position1: AuctionBidValueSchema.optional(),
  position2: AuctionBidValueSchema.optional(),
  position3: AuctionBidValueSchema.optional(),
});
export type AuctionBids = z.infer<typeof AuctionBidsSchema>;

export const AuctionConfigSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  cityId: z.string(),
  nicheId: z.string(),
  mode: z.enum(["manual", "smart", "auto"]).optional(),
  bids: AuctionBidsSchema.optional(),
  targetPosition: z.number().int().min(1).max(3).optional(),
  targetShare: z.enum(["one_in_3", "one_in_5", "one_in_10"]).optional(),
  dailyBudget: z.number().optional(),
  pauseOnLimit: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type AuctionConfig = z.infer<typeof AuctionConfigSchema>;

export const AuctionConfigInputSchema = z
  .object({
    id: z.string().optional(),
    companyId: z.string(),
    cityId: z.string(),
    nicheId: z.string(),
    mode: z.enum(["manual", "smart", "auto"]),
    bids: AuctionBidsSchema.optional(),
    targetPosition: z.number().int().min(1).max(3).optional(),
    targetShare: z.enum(["one_in_3", "one_in_5", "one_in_10"]).optional(),
    dailyBudget: z.number().int().positive(),
    pauseOnLimit: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.mode === "smart" || value.mode === "auto") &&
      value.targetPosition === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetPosition is required when mode is auto",
        path: ["targetPosition"],
      });
    }

    if (value.mode === "manual" && value.targetPosition !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetPosition must be omitted when mode is manual",
        path: ["targetPosition"],
      });
    }
  });
export type AuctionConfigInput = z.infer<typeof AuctionConfigInputSchema>;

export const AuctionSlotSchema = z.object({
  position: z.number().int(),
  company: CompanySchema.optional(),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  bidCents: z.number().optional(),
  currentBid: z.number().optional(),
  type: z.enum(["auction", "organic"]).optional(),
  isActive: z.boolean().optional(),
});
export type AuctionSlot = z.infer<typeof AuctionSlotSchema>;

export const AuctionSlotOverviewSchema = z.object({
  cityId: z.string().optional(),
  nicheId: z.string().optional(),
  slots: z.array(AuctionSlotSchema).optional(),
});
export type AuctionSlotOverview = z.infer<typeof AuctionSlotOverviewSchema>;

export const AuctionConfigQuerySchema = z.object({
  companyId: z.string().optional(),
  cityId: z.string().optional(),
  nicheId: z.string().optional(),
});
export type AuctionConfigQuery = z.infer<typeof AuctionConfigQuerySchema>;

export const AuctionSlotQuerySchema = z.object({
  cityId: z.string(),
  nicheId: z.string(),
});
export type AuctionSlotQuery = z.infer<typeof AuctionSlotQuerySchema>;

export const AuctionSummaryStatusSchema = z.enum([
  "active",
  "paused_by_limit",
  "insufficient_balance",
  "paused",
]);
export type AuctionSummaryStatus = z.infer<typeof AuctionSummaryStatusSchema>;

export const AuctionSummaryQuerySchema = z.object({
  cityId: z.string(),
  nicheId: z.string(),
  companyId: z.string().optional(),
});
export type AuctionSummaryQuery = z.infer<typeof AuctionSummaryQuerySchema>;

export const AuctionSummarySchema = z.object({
  cityId: z.string(),
  nicheId: z.string(),
  marketSlots: z
    .array(
      z.object({
        position: z.number().int().min(1).max(3),
        currentBidCents: z.number().int(),
      })
    )
    .optional(),
  todaySpentCents: z.number().int(),
  todayImpressionsPaid: z.number().int(),
  todayClicks: z.number().int(),
  status: AuctionSummaryStatusSchema,
  walletBalanceCents: z.number().int(),
  walletReservedCents: z.number().int(),
  avgPaidPosition: z.number().optional().nullable(),
  ctr: z.number().optional().nullable(),
});
export type AuctionSummary = z.infer<typeof AuctionSummarySchema>;

// =====================
// BILLING
// =====================

export const WalletSchema = z.object({
  balance: z.number(),
  reserved: z.number(),
  currency: z.string(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const TransactionSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  type: z.enum(["credit", "debit", "search_debit", "recharge"]),
  amount: z.number(),
  reason: z.string().optional(),
  status: z.enum(["pending", "confirmed", "cancelled"]).optional(),
  occurredAt: z.string().optional(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const RechargeIntentSchema = z.object({
  id: z.string(),
  amount: z.number(),
  method: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  fakePaymentInfo: z
    .object({
      type: z.string(),
      instructions: z.string(),
      reference: z.string(),
    })
    .optional(),
});
export type RechargeIntent = z.infer<typeof RechargeIntentSchema>;

export const BillingRechargeIntentInputSchema = z.object({
  companyId: z.string().optional(),
  amount: z.number(),
  method: z.enum(["pix", "credit_card", "boleto"]).optional(),
});
export type BillingRechargeIntentInput = z.infer<
  typeof BillingRechargeIntentInputSchema
>;

export const BillingTransactionsQuerySchema = z.object({
  companyId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export type BillingTransactionsQuery = z.infer<typeof BillingTransactionsQuerySchema>;

// =====================
// SEARCH
// =====================

export const SearchRequestSchema = z.object({
  query: z.string().optional(),
  cityId: z.string(),
  nicheId: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  source: z.enum(["whatsapp", "web", "demo"]).optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchResultSchema = z.object({
  company: CompanySchema.optional(),
  rank: z.number().int(),
  position: z.number().int(),
  isPaid: z.boolean(),
  chargedAmount: z.number().optional(),
  clickTrackingId: z.string().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const OfferedBySchema = z.object({
  text: z.string(),
  imageUrl: z.string().optional(),
  website: z.string().optional(),
  promotionsUrl: z.string().optional(),
  phoneE164: z.string().optional(),
  whatsappE164: z.string().optional(),
  configId: z.string().optional(),
  companyId: z.string().optional(),
});
export type OfferedBy = z.infer<typeof OfferedBySchema>;

export const SearchResponseSchema = z.object({
  searchId: z.string(),
  offeredBy: OfferedBySchema.optional(),
  results: z.array(SearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const SearchClickInputSchema = z.object({
  resultId: z.string(),
  channelType: z.enum(["phone", "whatsapp"]),
  companyId: z.string().optional(), // deprecated, ignored by backend
});
export type SearchClickInput = z.infer<typeof SearchClickInputSchema>;

export const SearchClickParamsSchema = z.object({
  searchId: z.string(),
});
export type SearchClickParams = z.infer<typeof SearchClickParamsSchema>;

// =====================
// CONTACT EVENTS
// =====================

export const ContactChannelSchema = z.enum(["whatsapp", "call"]);
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

export const ContactClassificationSchema = z.enum([
  "curious",
  "new_client",
  "recurring",
  "quote",
]);
export type ContactClassification = z.infer<typeof ContactClassificationSchema>;

export const ContactEventSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  channel: ContactChannelSchema,
  phone: z.string(),
  name: z.string().nullable().optional(),
  nicheId: z.string().nullable().optional(),
  classification: ContactClassificationSchema.nullable().optional(),
  createdAt: z.string().optional(),
});
export type ContactEvent = z.infer<typeof ContactEventSchema>;

export const ContactQuerySchema = z.object({
  channel: ContactChannelSchema.optional(),
  classification: z.union([ContactClassificationSchema, z.literal("null")]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
});
export type ContactQuery = z.infer<typeof ContactQuerySchema>;

export const ContactClassificationUpdateSchema = z.object({
  classification: ContactClassificationSchema.nullable().optional(),
});
export type ContactClassificationUpdate = z.infer<typeof ContactClassificationUpdateSchema>;

// =====================
// PRODUCTS
// =====================

export const ProductPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  monthlyPriceCents: z.number(),
  maxActiveOffers: z.number(),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ProductPlan = z.infer<typeof ProductPlanSchema>;

export const CompanyProductSubscriptionSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  planId: z.string(),
  status: z.enum(["active", "cancelled"]),
  startedAt: z.string(),
  cancelledAt: z.string().nullable().optional(),
  plan: ProductPlanSchema.optional(),
});
export type CompanyProductSubscription = z.infer<
  typeof CompanyProductSubscriptionSchema
>;

export const ProductSubscriptionBodySchema = z.object({
  planId: z.string(),
});
export type ProductSubscriptionBody = z.infer<typeof ProductSubscriptionBodySchema>;

export const ProductOfferSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  cityId: z.string(),
  nicheId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priceCents: z.number(),
  originalPriceCents: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ProductOffer = z.infer<typeof ProductOfferSchema>;

export const ProductOfferCreateInputSchema = z.object({
  cityId: z.string().uuid(),
  nicheId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  priceCents: z.number().int().positive(),
  originalPriceCents: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type ProductOfferCreateInput = z.infer<typeof ProductOfferCreateInputSchema>;

export const ProductOfferUpdateInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priceCents: z.number().int().positive().optional(),
  originalPriceCents: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type ProductOfferUpdateInput = z.infer<typeof ProductOfferUpdateInputSchema>;

export const PaginatedProductOffersSchema = z.object({
  items: z.array(ProductOfferSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PaginatedProductOffers = z.infer<typeof PaginatedProductOffersSchema>;

export const ProductSearchRequestSchema = z.object({
  cityId: z.string(),
  nicheId: z.string().optional(),
  query: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type ProductSearchRequest = z.infer<typeof ProductSearchRequestSchema>;

export const ProductSearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  priceCents: z.number().int(),
  validUntil: z.string().optional(),
  company: z.object({
    id: z.string(),
    name: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  city: z.object({
    id: z.string(),
    name: z.string().optional(),
  }),
  source: z.literal("product"),
});
export type ProductSearchResult = z.infer<typeof ProductSearchResultSchema>;

export const ProductSearchResponseSchema = z.object({
  items: z.array(ProductSearchResultSchema),
  total: z.number().int(),
});
export type ProductSearchResponse = z.infer<typeof ProductSearchResponseSchema>;

export const ProductOffersQuerySchema = z.object({
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
});
export type ProductOffersQuery = z.infer<typeof ProductOffersQuerySchema>;

// =====================
// SEARCH ANALYTICS
// =====================

export const SearchAnalyticsItemSchema = z.object({
  searchId: z.string(),
  createdAt: z.string(),
  city: z.string(),
  niche: z.string(),
  query: z.string(),
  totalResults: z.number().int(),
  paidResults: z.number().int(),
  organicResults: z.number().int(),
  totalCharged: z.number(),
  hasClicks: z.boolean(),
});
export type SearchAnalyticsItem = z.infer<typeof SearchAnalyticsItemSchema>;

export const SearchAnalyticsResponseSchema = z.object({
  items: z.array(SearchAnalyticsItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type SearchAnalyticsResponse = z.infer<typeof SearchAnalyticsResponseSchema>;

export const SearchAnalyticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  cityId: z.string().optional(),
  nicheId: z.string().optional(),
  companyId: z.string().optional(),
  page: z.number().int().optional(),
  pageSize: z.number().int().optional(),
});
export type SearchAnalyticsQuery = z.infer<typeof SearchAnalyticsQuerySchema>;

// =====================
// WHATSAPP INTEGRATION
// =====================

const WhatsappTextMessageSchema = z.object({
  id: z.string().optional(), // unique message identifier
  from: z.string().optional(), // user phone
  to: z.string().optional(), // our number (when provided)
  timestamp: z.string().optional(),
  type: z.string().optional(), // expect "text" for messages we process
  text: z
    .object({
      body: z.string().optional(), // text body
    })
    .optional(),
  raw: z.unknown().optional(), // placeholder for unused extra fields
});

export const WhatsappWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z
        .array(
          z.object({
            value: z
              .object({
                messages: z.array(WhatsappTextMessageSchema).optional(),
                metadata: z
                  .object({
                    phone_number_id: z.string().optional(), // our number
                  })
                  .optional(),
                raw: z.unknown().optional(),
              })
              .optional(),
            field: z.string().optional(),
          })
        )
        .optional(),
    })
  ),
  raw: z.unknown().optional(),
});
export type WhatsappWebhookPayload = z.infer<typeof WhatsappWebhookPayloadSchema>;

export const WhatsappInboundMessageSchema = z.object({
  from: z.string(),
  phoneNumberId: z.string(),
  messageId: z.string(),
  text: z.string(),
});
export type WhatsappInboundMessage = z.infer<typeof WhatsappInboundMessageSchema>;

export const WhatsappOutboundMessageSchema = z.object({
  to: z.string(),
  phoneNumberId: z.string(),
  body: z.string(),
});
export type WhatsappOutboundMessage = z.infer<typeof WhatsappOutboundMessageSchema>;

// =====================
// INTERNAL
// =====================

export const HealthResponseSchema = z.object({
  status: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// =====================
// NOTIFICATIONS
// =====================

export const NotificationCategorySchema = z.enum([
  "financial",
  "visibility",
  "subscription",
  "contacts",
  "system",
]);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

export const NotificationSeveritySchema = z.enum(["low", "medium", "high"]);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const NotificationKindSchema = z.enum(["event", "summary", "alert"]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

export const NotificationFrequencySchema = z.enum([
  "real_time",
  "daily",
  "weekly",
  "never",
]);
export type NotificationFrequency = z.infer<typeof NotificationFrequencySchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  category: NotificationCategorySchema,
  severity: NotificationSeveritySchema,
  kind: NotificationKindSchema,
  title: z.string(),
  message: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
  dedupeKey: z.string().nullable().optional(),
  bucketDate: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsResponseSchema = z.object({
  items: z.array(NotificationSchema),
  nextOffset: z.number().int().nullable().optional(),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export const NotificationPreferencesSchema = z.object({
  companyId: z.string(),
  panelEnabled: z.boolean(),
  financialEnabled: z.boolean(),
  visibilityEnabled: z.boolean(),
  subscriptionEnabled: z.boolean(),
  contactsEnabled: z.boolean(),
  systemEnabled: z.boolean(),
  frequency: NotificationFrequencySchema,
  whatsappEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
