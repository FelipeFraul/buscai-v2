import {
  SearchRequestSchema,
  type SearchRequest,
  type SearchResponse,
  type WhatsappInboundMessage,
  type WhatsappWebhookPayload,
} from "@buscai/shared-schema";
import axios, { type AxiosInstance } from "axios";
import { asc, eq, ilike } from "drizzle-orm";

import { ENV } from "../../config/env";
import { AppError } from "../../core/errors";
import { db } from "../../core/database/client";
import { cities, niches } from "../catalog/catalog.schema";
import { logger } from "../../core/logger";
import { InternalAuditService } from "../internal-audit/internal-audit.service";
import { SearchService } from "../search/search.service";
import { MessagesService, type MessageHistoryEntry } from "../messages/messages.service";
import { cleanSearchText } from "../search/search-text";
import { WhatsappAbuseService } from "../whatsapp-abuse/whatsapp-abuse.service";
import { ProductsService } from "../products/products.service";
import { CompaniesRepository } from "../companies/companies.repository";
import { ContactService } from "../contacts/contact.service";
import { createOfferedByTrackingToken } from "../offered-by/offered-by-tracking";

const DEDUPE_TTL_MS = 60_000; // minimal in-memory dedupe window
const OUTBOUND_DEDUPE_TTL_MS = 5 * 60_000;
const OUTBOUND_MAX_RETRIES = 3;
const OUTBOUND_RETRY_BASE_DELAY_MS = 300;
const SESSION_TTL_MS = 30 * 60_000;
const maskPhone = (value?: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  const ddd = digits.length >= 2 ? digits.slice(0, 2) : digits.slice(0, 1);
  const suffix = digits.slice(-2);
  return `${ddd}*****${suffix}`;
};
const processedMessages = new Map<string, number>();
const processedOutboundMessages = new Map<string, number>();
const whatsappSessions = new Map<
  string,
  {
    city: string;
    updatedAt: number;
    nichePreferences?: Record<string, string>;
    lastSearchReply?: string;
    lastSearchQueryKey?: string;
    pendingActionMenu?: {
      options: Array<{ id: string; label: string; action: "new_search" | "resend" | "end" }>;
      createdAt: number;
    };
    pendingNicheChoices?: {
      queryKey: string;
      cleanedQuery: string;
      options: Array<{ id: string; label: string }>;
      createdAt: number;
    };
    pendingOfferedBy?: {
      offeredBy: {
        text: string;
        configId?: string;
        companyId?: string;
        website?: string;
        promotionsUrl?: string;
        phoneE164?: string;
        whatsappE164?: string;
      };
      cityId?: string | null;
      nicheId?: string | null;
      searchType?: "niche" | "company" | "product";
      options: Array<{ id: string; label: string; type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions" }>;
      createdAt: number;
    };
  }
>();

export class WhatsappService {
  private readonly apiBaseUrl = ENV.WHATSAPP_API_URL?.replace(/\/$/, "") ?? "";
  private readonly apiToken = ENV.WHATSAPP_API_TOKEN;
  private readonly provider = ENV.WHATSAPP_PROVIDER;

  constructor(
    private readonly searchService: SearchService,
    private readonly auditService: InternalAuditService,
    private readonly httpClient: AxiosInstance = axios,
    private readonly messagesService?: MessagesService,
    private readonly abuseService?: WhatsappAbuseService,
    private readonly productsService?: ProductsService,
    private readonly companiesRepository?: CompaniesRepository,
    private readonly contactService?: ContactService
  ) {}

  async handleWebhook(payload: WhatsappWebhookPayload): Promise<void> {
    const inboundMessages = this.extractInboundMessages(payload);
    if (!inboundMessages.length) {
      return;
    }

    this.purgeExpiredMessages();

    for (const message of inboundMessages) {
      const dedupeKey = this.buildDedupeKey(message);
      if (this.isDuplicate(dedupeKey)) {
        continue;
      }

      this.markProcessed(dedupeKey);
      await this.handleInboundSearch(message);
    }
  }

  // Compat wrapper (legacy callers may still use processWebhook)
  async processWebhook(payload: WhatsappWebhookPayload): Promise<void> {
    await this.handleWebhook(payload);
  }

  extractInboundMessages(payload: WhatsappWebhookPayload): WhatsappInboundMessage[] {
    const messages: WhatsappInboundMessage[] = [];

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        const inbound = change.value?.messages ?? [];

        if (!phoneNumberId || !Array.isArray(inbound)) continue;

        for (const message of inbound) {
          const text =
            message.text?.body ??
            message.button?.text ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            message.interactive?.list_reply?.id ??
            "";
          const trimmed = text.trim();
          const from = message.from;
          if (!trimmed || !from || from === phoneNumberId) continue;

          const messageId = message.id ?? `${from}-${message.timestamp ?? Date.now()}`;
          messages.push({
            from,
            phoneNumberId,
            messageId,
            text: trimmed,
          });
        }
      }
    }

    return messages;
  }

  normalizeToSearchRequest(message: WhatsappInboundMessage): SearchRequest | null {
    const cityId = ENV.WHATSAPP_DEFAULT_CITY_ID;
    const nicheId = ENV.WHATSAPP_DEFAULT_NICHE_ID;
    const query = message.text.trim();
    if (!cityId || !nicheId || !query) {
      return null;
    }

    return SearchRequestSchema.parse({
      query,
      cityId,
      nicheId,
      source: "whatsapp",
    });
  }

  async handleInboundSearch(message: {
    from: string;
    text: string;
    phoneNumberId?: string | null;
    messageId?: string | null;
  }): Promise<void> {
    const sessionBefore = this.getSession(message.from);
    const activeBlock = this.abuseService
      ? await this.abuseService.getActiveBlock(message.from)
      : null;
    if (activeBlock) {
      const replyText =
        activeBlock.message ??
        "Seu numero esta bloqueado no momento. Tente novamente mais tarde.";
      logger.info("whatsapp.reply.chosen", {
        replyType: "blocked",
        replyPreview: replyText,
        reason: activeBlock.reason,
      });
      await this.safeSendText(message.from, replyText, {
        phoneNumberId: message.phoneNumberId,
      });
      return;
    }

    const pendingMenu = sessionBefore?.pendingActionMenu ?? null;
    const resolvedMenu = this.resolvePendingActionMenu(message.text, pendingMenu);
    if (resolvedMenu) {
      this.setSession(message.from, sessionBefore?.city ?? "", {
        pendingActionMenu: undefined,
      });
      if (resolvedMenu.action === "resend" && sessionBefore?.lastSearchReply) {
        logger.info("whatsapp.reply.chosen", {
          replyType: "search_results",
          replyPreview: this.previewReply(sessionBefore.lastSearchReply),
          reason: "resend_menu",
        });
        await this.safeSendText(message.from, sessionBefore.lastSearchReply, {
          phoneNumberId: message.phoneNumberId,
        });
        return;
      }
      if (resolvedMenu.action === "new_search") {
        logger.info("whatsapp.reply.chosen", {
          replyType: "prompt_query",
          replyPreview: "Ok. O que voce procura?",
          reason: "menu_new_search",
        });
        await this.safeSendText(message.from, "Ok. O que voce procura?", {
          phoneNumberId: message.phoneNumberId,
        });
        return;
      }
      if (resolvedMenu.action === "end") {
        logger.info("whatsapp.reply.chosen", {
          replyType: "ended",
          replyPreview: "Tudo bem! Quando precisar, e so chamar.",
          reason: "menu_end",
        });
        await this.safeSendText(
          message.from,
          "Tudo bem! Quando precisar, e so chamar.",
          { phoneNumberId: message.phoneNumberId }
        );
        return;
      }
    }

    const pendingOfferedBy = sessionBefore?.pendingOfferedBy ?? null;
    const hasInboundText = Boolean(message.text);
    if (pendingOfferedBy) {
      logger.info("whatsapp.offered_by.pending", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        options: pendingOfferedBy.options.map((option) => ({
          id: option.id,
          label: option.label,
          type: option.type,
        })),
        searchType: pendingOfferedBy.searchType ?? "niche",
        cityId: pendingOfferedBy.cityId ?? null,
        nicheId: pendingOfferedBy.nicheId ?? null,
      });
    }
    const offeredByAction = this.resolvePendingOfferedByAction(
      message.text,
      pendingOfferedBy
    );
    if (offeredByAction && pendingOfferedBy) {
      logger.info("whatsapp.offered_by.matched", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        action: offeredByAction.type,
        hasText: hasInboundText,
      });
      await this.searchService.recordOfferedByEvent({
        offeredBy: pendingOfferedBy.offeredBy,
        type: offeredByAction.type,
        source: "whatsapp",
        cityId: pendingOfferedBy.cityId ?? null,
        nicheId: pendingOfferedBy.nicheId ?? null,
        searchType: pendingOfferedBy.searchType ?? "niche",
      });
      if (offeredByAction.replyText) {
        await this.safeSendText(message.from, offeredByAction.replyText, {
          phoneNumberId: message.phoneNumberId,
        });
      }
      return;
    }
    if (pendingOfferedBy) {
      logger.info("whatsapp.offered_by.no_match", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        hasText: hasInboundText,
      });
    }

    if (this.isResendRequest(message.text) && sessionBefore?.lastSearchReply) {
      logger.info("whatsapp.reply.chosen", {
        replyType: "search_results",
        replyPreview: this.previewReply(sessionBefore.lastSearchReply),
        reason: "resend_request",
      });
      await this.safeSendText(message.from, sessionBefore.lastSearchReply, {
        phoneNumberId: message.phoneNumberId,
      });
      return;
    }

    if (this.isActionKeyword(message.text) && sessionBefore?.lastSearchReply) {
      await this.promptActionMenu(message.from, sessionBefore.city, {
        phoneNumberId: message.phoneNumberId,
      });
      return;
    }

    const normalizedText = this.normalizeText(message.text);
    const parsed = await this.resolveCityAndQuery(message.text, sessionBefore?.city ?? null);
    logger.info("whatsapp.intent.detected", {
      phoneMasked: maskPhone(message.from),
      messageId: message.messageId ?? null,
      normalizedText,
      detectedCity: parsed.city,
      detectedQuery: parsed.query,
      cleanedQuery: parsed.cleanedQuery,
      tokens: parsed.tokens,
      branch: parsed.branch,
    });
    logger.info("whatsapp.session.before", {
      phoneMasked: maskPhone(message.from),
      messageId: message.messageId ?? null,
      sessionState: sessionBefore ? { city: sessionBefore.city } : "none",
    });
    const pendingChoice = this.resolvePendingNicheChoice(
      message.text,
      sessionBefore?.pendingNicheChoices ?? null
    );
    if (!parsed.city) {
      logger.info("whatsapp.reply.chosen", {
        replyType: "prompt_city",
        replyPreview: "Me diga sua cidade...",
        reason: "missing_city",
      });
      await this.safeSendText(
        message.from,
        "Me diga sua cidade (ex: Cidade: Itapetininga) e o que voce procura.",
        { phoneNumberId: message.phoneNumberId }
      );
      logger.info("whatsapp.session.after", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        sessionState: sessionBefore ? { city: sessionBefore.city } : "none",
      });
      return;
    }

    if (parsed.cityOnly && !pendingChoice) {
      this.setSession(message.from, parsed.city);
      logger.info("whatsapp.reply.chosen", {
        replyType: "prompt_query",
        replyPreview: "Ok. O que voce procura?",
        reason: "city_only",
      });
      await this.safeSendText(message.from, "Ok. O que voce procura?", {
        phoneNumberId: message.phoneNumberId,
      });
      logger.info("whatsapp.session.after", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        sessionState: { city: parsed.city },
      });
      return;
    }

    if (!parsed.cleanedQuery && sessionBefore?.lastSearchReply) {
      await this.promptActionMenu(message.from, parsed.city ?? sessionBefore.city ?? "", {
        phoneNumberId: message.phoneNumberId,
      });
      return;
    }

    this.setSession(message.from, parsed.city);

    const baseQueryKey = parsed.tokens.join(" ");
    const effectiveQueryKey = pendingChoice?.queryKey ?? baseQueryKey;
    const effectiveQueryText = pendingChoice?.cleanedQuery ?? parsed.cleanedQuery;
    if (pendingChoice) {
      this.setSession(message.from, parsed.city, {
        nichePreferences: {
          ...(sessionBefore?.nichePreferences ?? {}),
          [pendingChoice.queryKey]: pendingChoice.label,
        },
        pendingNicheChoices: undefined,
      });
    } else if (sessionBefore?.pendingNicheChoices) {
      this.setSession(message.from, parsed.city, {
        pendingNicheChoices: undefined,
      });
    }

    const cityIdForSearch = await this.searchService.findCityIdByName(parsed.city);
    const preferCompany = await this.isLikelyCompanyQuery(
      parsed.query,
      cityIdForSearch
    );

    if (preferCompany && this.companiesRepository) {
      const candidates = await this.companiesRepository.searchCompaniesByNameWithNiches({
        query: parsed.query,
        cityId: cityIdForSearch ?? undefined,
        limit: 5,
      });
      const fallback =
        candidates.length === 0
          ? await this.companiesRepository.searchCompaniesByNameWithNiches({
              query: parsed.query,
              limit: 5,
            })
          : [];
      const companies = candidates.length > 0 ? candidates : fallback;

      if (companies.length > 0) {
        const reply = this.formatCompanySearchReply(companies);
        logger.info("whatsapp.reply.chosen", {
          replyType: "company_results",
          replyPreview: this.previewReply(reply),
          reason: "company_search",
        });
        const offeredBy =
          cityIdForSearch && companies[0]?.niches?.length
            ? await this.searchService.getOfferedByForContext({
                cityId: cityIdForSearch,
                nicheId: companies[0]?.niches?.[0]?.id ?? null,
              })
            : cityIdForSearch
            ? await this.searchService.getOfferedByForContext({
                cityId: cityIdForSearch,
                nicheId: null,
              })
            : undefined;
        this.setSession(message.from, parsed.city, {
          lastSearchReply: reply,
          lastSearchQueryKey: effectiveQueryKey || null,
          pendingActionMenu: undefined,
          pendingNicheChoices: undefined,
        });
        await this.safeSendText(message.from, reply, {
          phoneNumberId: message.phoneNumberId,
        });
        await this.recordWhatsappContacts({
          reason: "company_search",
          phone: message.from,
          messageId: message.messageId ?? null,
          companyIds: companies.map((row) => ({
            companyId: row.company.id,
            nicheId: row.niches?.[0]?.id ?? null,
          })),
        });
        if (offeredBy) {
          const sentOffered = await this.sendOfferedByMessage(message.from, offeredBy, {
            phoneNumberId: message.phoneNumberId,
            trackingContext: {
              cityId: cityIdForSearch ?? null,
              nicheId: companies[0]?.niches?.[0]?.id ?? null,
              searchType: "company",
            },
          });
          if (sentOffered) {
            await this.searchService.recordOfferedByEvent({
              offeredBy,
              type: "impression",
              source: "whatsapp",
              cityId: cityIdForSearch ?? null,
              nicheId: companies[0]?.niches?.[0]?.id ?? null,
              searchType: "company",
            });
            this.setSession(message.from, parsed.city, {
              pendingOfferedBy: this.buildPendingOfferedBy(offeredBy, {
                cityId: cityIdForSearch ?? null,
                nicheId: companies[0]?.niches?.[0]?.id ?? null,
                searchType: "company",
              }),
            });
          }
        }
        logger.info("whatsapp.session.after", {
          phoneMasked: maskPhone(message.from),
          messageId: message.messageId ?? null,
          sessionState: { city: parsed.city },
        });
        return;
      }

      const emptyReply = `Nao encontrei resultados para "${effectiveQueryText}".`;
      logger.info("whatsapp.reply.chosen", {
        replyType: "company_empty",
        replyPreview: this.previewReply(emptyReply),
        reason: "company_search_empty",
      });
      await this.safeSendText(message.from, emptyReply, {
        phoneNumberId: message.phoneNumberId,
      });
      logger.info("whatsapp.session.after", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        sessionState: { city: parsed.city },
      });
      return;
    }

    const shouldUseProductSearch = this.isProductIntent(effectiveQueryText, parsed.tokens);
    if (!pendingChoice && !preferCompany && shouldUseProductSearch && this.productsService && effectiveQueryText) {
      if (cityIdForSearch) {
        const productResults = await this.productsService.searchProductOffers({
          cityId: cityIdForSearch,
          query: effectiveQueryText,
          limit: 5,
        });

        if (productResults.items.length === 0) {
          const emptyReply = `No momento nao ha oferta de "${effectiveQueryText}".`;
          logger.info("whatsapp.reply.chosen", {
            replyType: "product_empty",
            replyPreview: this.previewReply(emptyReply),
            reason: "product_search_empty",
          });
          await this.safeSendText(message.from, emptyReply, {
            phoneNumberId: message.phoneNumberId,
          });
          logger.info("whatsapp.session.after", {
            phoneMasked: maskPhone(message.from),
            messageId: message.messageId ?? null,
            sessionState: { city: parsed.city },
          });
          return;
        }

        const productReply = this.formatProductSearchReply(productResults.items);
        logger.info("whatsapp.reply.chosen", {
          replyType: "product_results",
          replyPreview: this.previewReply(productReply),
          reason: "product_search",
        });
        const offeredBy = cityIdForSearch
          ? await this.searchService.getOfferedByForContext({
              cityId: cityIdForSearch,
              nicheId: null,
            })
          : undefined;

        this.setSession(message.from, parsed.city, {
          lastSearchReply: productReply,
          lastSearchQueryKey: effectiveQueryKey || null,
          pendingActionMenu: undefined,
          pendingNicheChoices: undefined,
        });

        await this.safeSendText(message.from, productReply, {
          phoneNumberId: message.phoneNumberId,
        });
        await this.recordWhatsappContacts({
          reason: "product_search",
          phone: message.from,
          messageId: message.messageId ?? null,
          companyIds: productResults.items
            .map((item) => ({
              companyId: item.company?.id ?? "",
              nicheId: null,
            }))
            .filter((entry) => Boolean(entry.companyId)),
        });
        if (offeredBy) {
          const sentOffered = await this.sendOfferedByMessage(message.from, offeredBy, {
            phoneNumberId: message.phoneNumberId,
            trackingContext: {
              cityId: cityIdForSearch ?? null,
              nicheId: null,
              searchType: "product",
            },
          });
          if (sentOffered) {
            await this.searchService.recordOfferedByEvent({
              offeredBy,
              type: "impression",
              source: "whatsapp",
              cityId: cityIdForSearch ?? null,
              nicheId: null,
              searchType: "product",
            });
            this.setSession(message.from, parsed.city, {
              pendingOfferedBy: this.buildPendingOfferedBy(offeredBy, {
                cityId: cityIdForSearch ?? null,
                nicheId: null,
                searchType: "product",
              }),
            });
          }
        }
        logger.info("whatsapp.session.after", {
          phoneMasked: maskPhone(message.from),
          messageId: message.messageId ?? null,
          sessionState: { city: parsed.city },
        });
        return;
      }
    }

    const preferredNiche =
      pendingChoice?.label ??
      (effectiveQueryKey ? sessionBefore?.nichePreferences?.[effectiveQueryKey] : undefined);
    let chosenNicheLabel = preferredNiche ?? null;

    let searchResponse: SearchResponse;
    let resolvedNicheLabel: string | null = chosenNicheLabel;
    let resolvedNicheId: string | null = null;
    try {
      if (!preferredNiche) {
        const cityId = await this.searchService.findCityIdByName(parsed.city);
        if (cityId) {
          const candidates = await this.searchService.getNicheCandidates({
            cityId,
            text: effectiveQueryText,
            limit: 10,
          });
          if (candidates.length >= 6) {
            logger.info("whatsapp.reply.chosen", {
              replyType: "prompt_refine",
              replyPreview: "Pode ser mais especifico...",
              reason: "niche_too_many",
            });
            await this.safeSendText(
              message.from,
              "Pode ser mais especifico? (Ex: Medico Pediatra, Advogado Civil, Professor de Yoga).",
              { phoneNumberId: message.phoneNumberId }
            );
            logger.info("whatsapp.session.after", {
              phoneMasked: maskPhone(message.from),
              messageId: message.messageId ?? null,
              sessionState: { city: parsed.city },
            });
            return;
          }

          if (this.isAmbiguousNicheMatch(candidates)) {
            await this.promptNicheChoice(
              message.from,
              parsed.city,
              effectiveQueryKey,
              effectiveQueryText,
              candidates,
              {
                phoneNumberId: message.phoneNumberId,
              }
            );
            return;
          }

          const defaultPick = this.pickDefaultNiche(candidates)?.label ?? null;
          if (defaultPick && effectiveQueryKey) {
            this.setSession(message.from, parsed.city, {
              nichePreferences: {
                ...(sessionBefore?.nichePreferences ?? {}),
                [effectiveQueryKey]: defaultPick,
              },
            });
          }
          if (defaultPick) {
            resolvedNicheLabel = defaultPick;
            chosenNicheLabel = defaultPick;
          }
        }
      }

      resolvedNicheId = resolvedNicheLabel
        ? await this.findNicheIdByLabel(resolvedNicheLabel)
        : null;
      if (resolvedNicheId && this.abuseService) {
        const decision = await this.abuseService.evaluateAndBlock({
          phone: message.from,
          nicheId: resolvedNicheId,
        });
        if (decision.blocked) {
          logger.info("whatsapp.reply.chosen", {
            replyType: "blocked",
            replyPreview: decision.message ?? "Numero bloqueado",
            reason: "threshold_block",
          });
          await this.safeSendText(
            message.from,
            decision.message ?? "Seu numero esta bloqueado no momento.",
            { phoneNumberId: message.phoneNumberId }
          );
          return;
        }
      }

      searchResponse = await this.searchService.publicSearch({
        text: effectiveQueryText,
        city: parsed.city,
        limit: 5,
        niche: chosenNicheLabel ?? undefined,
        source: "whatsapp",
      });
      if (this.isDisambiguationResponse(searchResponse)) {
        await this.promptNicheChoice(
          message.from,
          parsed.city ?? "",
          effectiveQueryKey,
          effectiveQueryText,
          searchResponse.nicheOptions,
          { phoneNumberId: message.phoneNumberId }
        );
        return;
      }
    } catch (error) {
      if (error instanceof AppError) {
        if (error.message === "city_not_found" || error.message === "city_required") {
          logger.info("whatsapp.reply.chosen", {
            replyType: "prompt_city",
            replyPreview: "Me diga sua cidade...",
            reason: error.message,
          });
          await this.safeSendText(
            message.from,
            "Me diga sua cidade (ex: Cidade: Itapetininga) e o que voce procura.",
            { phoneNumberId: message.phoneNumberId }
          );
          logger.info("whatsapp.session.after", {
            phoneMasked: maskPhone(message.from),
            messageId: message.messageId ?? null,
            sessionState: sessionBefore ? { city: sessionBefore.city } : "none",
          });
          return;
        }
        if (error.message === "niche_not_found") {
          logger.info("whatsapp.reply.chosen", {
            replyType: "prompt_refine",
            replyPreview: "Nao encontrei esse termo...",
            reason: error.message,
          });
          await this.safeSendText(
            message.from,
            "Nao encontrei esse termo. Tente descrever melhor o que voce procura.",
            { phoneNumberId: message.phoneNumberId }
          );
          logger.info("whatsapp.session.after", {
            phoneMasked: maskPhone(message.from),
            messageId: message.messageId ?? null,
            sessionState: sessionBefore ? { city: sessionBefore.city } : "none",
          });
          return;
        }
      }

      logger.info("whatsapp.reply.chosen", {
        replyType: "error",
        replyPreview: "Erro interno",
        reason: "public_search_failed",
      });
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: {
          reason: "public_search_failed",
          phoneMasked: maskPhone(message.from),
          error: (error as Error).message,
        },
      });
      return;
    }

    if (!resolvedNicheId && chosenNicheLabel) {
      resolvedNicheId = await this.findNicheIdByLabel(chosenNicheLabel);
    }
    if (!resolvedNicheId) {
      const searchRecord = await this.searchService.findSearchById(searchResponse.searchId);
      resolvedNicheId = searchRecord?.nicheId ?? null;
    }
    if (resolvedNicheId && this.abuseService) {
      await this.abuseService.logQuery({
        phone: message.from,
        nicheId: resolvedNicheId,
        queryText: effectiveQueryText,
      });
    }

    const isDirect = this.isDirectCompanySearch(effectiveQueryText, searchResponse);
    const reply = this.formatSearchReply(parsed.cleanedQuery, searchResponse, { direct: isDirect });
    if (!reply) {
      logger.info("whatsapp.reply.chosen", {
        replyType: "none",
        replyPreview: "",
        reason: "empty_reply",
      });
      logger.info("whatsapp.session.after", {
        phoneMasked: maskPhone(message.from),
        messageId: message.messageId ?? null,
        sessionState: { city: parsed.city },
      });
      return;
    }

    logger.info("whatsapp.reply.chosen", {
      replyType: "search_results",
      replyPreview: this.previewReply(reply),
      reason: "search_ok",
    });

    this.setSession(message.from, parsed.city, {
      lastSearchReply: reply,
      lastSearchQueryKey: effectiveQueryKey || null,
      pendingActionMenu: undefined,
      pendingNicheChoices: undefined,
    });

    let sent = false;
    if (this.provider === "zapi") {
      sent = await this.sendZapiSearchResults(
        message.from,
        parsed.cleanedQuery,
        searchResponse,
        { direct: isDirect }
      );
      await this.recordWhatsappContacts({
        reason: "search_results",
        phone: message.from,
        messageId: message.messageId ?? null,
        companyIds: (searchResponse.results ?? [])
          .filter((result) => {
            const hasAuctionPosition =
              typeof (result as { auctionPosition?: number }).auctionPosition === "number";
            const isPaid =
              hasAuctionPosition ||
              (Object.prototype.hasOwnProperty.call(result, "isPaid") && result.isPaid === true);
            return isPaid;
          })
          .map((result) => ({
            companyId: result.company?.id ?? "",
            nicheId: resolvedNicheId ?? null,
          }))
          .filter((entry) => Boolean(entry.companyId)),
      });
      const pending = searchResponse.offeredBy
        ? this.buildPendingOfferedBy(searchResponse.offeredBy, {
            cityId: cityIdForSearch ?? null,
            nicheId: resolvedNicheId ?? null,
            searchType: "niche",
          })
        : null;
      if (pending) {
        this.setSession(message.from, parsed.city, {
          pendingOfferedBy: pending,
        });
      }
    } else {
      sent = await this.safeSendText(message.from, reply, {
        phoneNumberId: message.phoneNumberId,
      });
      await this.recordWhatsappContacts({
        reason: "search_results",
        phone: message.from,
        messageId: message.messageId ?? null,
        companyIds: (searchResponse.results ?? [])
          .filter((result) => {
            const hasAuctionPosition =
              typeof (result as { auctionPosition?: number }).auctionPosition === "number";
            const isPaid =
              hasAuctionPosition ||
              (Object.prototype.hasOwnProperty.call(result, "isPaid") && result.isPaid === true);
            return isPaid;
          })
          .map((result) => ({
            companyId: result.company?.id ?? "",
            nicheId: resolvedNicheId ?? null,
          }))
          .filter((entry) => Boolean(entry.companyId)),
      });
      const sentOffered = await this.sendOfferedByMessage(message.from, searchResponse.offeredBy, {
        phoneNumberId: message.phoneNumberId ?? undefined,
        trackingContext: {
          cityId: cityIdForSearch ?? null,
          nicheId: resolvedNicheId ?? null,
          searchType: "niche",
        },
      });
      const pending = sentOffered && searchResponse.offeredBy
        ? this.buildPendingOfferedBy(searchResponse.offeredBy, {
            cityId: cityIdForSearch ?? null,
            nicheId: resolvedNicheId ?? null,
            searchType: "niche",
          })
        : null;
      if (pending) {
        this.setSession(message.from, parsed.city, {
          pendingOfferedBy: pending,
        });
      }
    }

    if (this.messagesService) {
      await this.recordMessageHistory({
        searchResponse,
        peerE164: message.from,
        providerMessageId: message.messageId ?? null,
        inboundText: message.text,
        outboundText: reply,
        phoneNumberId: message.phoneNumberId ?? null,
        query: parsed.cleanedQuery,
        city: parsed.city,
        sendStatus: sent ? "sent" : "failed",
      });
    }
    logger.info("whatsapp.session.after", {
      phoneMasked: maskPhone(message.from),
      messageId: message.messageId ?? null,
      sessionState: { city: parsed.city },
    });
  }

  private async resolveSearchRequest(
    message: WhatsappInboundMessage
  ): Promise<SearchRequest | null> {
    const context = await this.resolveWhatsAppContext(message.text);
    if (!context) {
      return null;
    }

    return SearchRequestSchema.parse({
      query: message.text.trim(),
      cityId: context.cityId,
      nicheId: context.nicheId,
      source: "whatsapp",
    });
  }

  private async processMessage(message: WhatsappInboundMessage): Promise<void> {
    const query = message.text.trim();
    if (!query) {
      return;
    }

    let searchRequest: SearchRequest | null;
    try {
      searchRequest = await this.resolveSearchRequest(message);
    } catch (error) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: {
          reason: "invalid_search_params",
          phoneMasked: maskPhone(message.from),
          error: (error as Error).message,
        },
      });
      return;
    }

    if (!searchRequest) {
      const replyText =
        "Catalogo nao configurado. Configure cidades e nichos no painel ou rode o seed.";
      try {
        await this.sendText(message.from, replyText, {
          phoneNumberId: message.phoneNumberId,
        });
      } catch (error) {
        await this.auditService.logEvent({
          type: "webhook_failure",
          payload: {
            reason: "send_text_failed",
            phoneMasked: maskPhone(message.from),
            error: (error as Error).message,
          },
        });
      }

      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: {
          reason: "catalog_not_configured",
          phoneMasked: maskPhone(message.from),
        },
      });
      return;
    }

    let searchResponse: SearchResponse | null = null;
    try {
      searchResponse = (await this.searchService.search(searchRequest)) as SearchResponse;
    } catch (error) {
      await this.auditService.logEvent({
        type: "search_error",
        payload: {
          source: "whatsapp",
          phoneMasked: maskPhone(message.from),
          queryLength: query.length,
          error: (error as Error).message,
        },
      });
      return;
    }

    const replyText = this.buildReplyMessage(query, searchResponse);
    let replied = false;

    if (replyText) {
      try {
        await this.sendText(message.from, replyText, {
          phoneNumberId: message.phoneNumberId,
        });
        replied = true;
      } catch (error) {
        await this.auditService.logEvent({
          type: "webhook_failure",
          payload: {
            reason: "send_text_failed",
            phoneMasked: maskPhone(message.from),
            error: (error as Error).message,
          },
        });
      }
    }

    await this.auditService.logEvent({
      type: "search_performed",
      payload: {
        source: "whatsapp",
        phoneMasked: maskPhone(message.from),
        queryLength: query.length,
        resultsCount: searchResponse?.results?.length ?? 0,
        replied,
      },
    });
  }

  private buildReplyMessage(query: string, searchResponse: SearchResponse): string {
    const results = (searchResponse.results ?? [])
      .slice(0, 5)
      .sort((a, b) => a.position - b.position);

    if (!results.length) {
      return `Nao encontrei resultados para "${query}".\nTente buscar com outro termo.`;
    }

    const lines = results.map((result) => {
      const company = result.company;
      const name = company?.tradeName ?? "Empresa";
      const city = company?.city?.name;
      const whatsapp = company?.channels?.whatsapp;
      const phone = company?.channels?.phone;
      const contactLabel = whatsapp ? "WhatsApp" : "Ligar";
      const contactValue = whatsapp ?? phone ?? null;
      const contact = contactValue
        ? `${contactLabel}: ${contactValue}`
        : "Contato indisponivel";
      const label = result.isPaid ? "Leilao" : "Organico";
      const offeredBy =
        company?.legalName && company.legalName !== company.tradeName
          ? ` (Oferecido por: ${company.legalName})`
          : "";

      const parts = [name];
      if (city) parts.push(city);

      return `${result.position}) ${parts.join(" - ")} | ${label} | ${contact}${offeredBy}`;
    });

    return `Resultados para "${query}":\n${lines.join("\n")}`;
  }

  private formatSearchReply(
    query: string,
    searchResponse: SearchResponse,
    options?: { direct?: boolean }
  ): string | null {
    const ordered = [...(searchResponse.results ?? [])]
      .sort((a, b) => a.position - b.position)
      .slice(0, 5);

    if (!ordered.length) {
      return `Nao encontrei resultados para "${query}".`;
    }

    const separator = "\u2703--------------------------------------------------------------";

    const blocks = ordered.map((result) => {
      const company = result.company;
      const name = company?.tradeName ?? "Empresa";
      const address = this.formatShortAddress(company?.channels?.address);
      const phone = company?.channels?.phone ?? null;
      const whatsapp = company?.channels?.whatsapp ?? null;
      const hasAuctionPosition =
        typeof (result as { auctionPosition?: number }).auctionPosition === "number";
      const isPaid =
        hasAuctionPosition ||
        (Object.prototype.hasOwnProperty.call(result, "isPaid") && result.isPaid === true);

      if (options?.direct) {
        return this.formatDirectCompanyDetails(company);
      }

      if (isPaid) {
        const medal = this.getAuctionMedal(result.position);
        const lines = [`*${name}* ${medal}`.trim()];
        if (address) {
          lines.push(`Endereco: \`\`\`${address}\`\`\``);
        }
        if (phone) {
          lines.push(`> Telefone: ${phone}`);
        }
        if (whatsapp) {
          lines.push(`> WhatsApp: ${whatsapp}`);
        }
        return { text: lines.join("\n") };
      }

      const lines = [`*${name}* \uD83C\uDF9F`];
      const displayPhone = whatsapp ?? phone ?? null;
      if (displayPhone) {
        lines.push(this.formatPhoneNoLink(displayPhone));
      }
      return { text: lines.join("\n") };
    });

    const outputLines: string[] = [];
    blocks.forEach((block) => {
      outputLines.push(block.text);
      outputLines.push(separator);
    });

    return outputLines.join("\n");
  }

  private formatProductSearchReply(
    items: Array<{
      title: string;
      priceCents: number;
      validUntil?: string;
      company?: { name?: string; address?: string };
    }>
  ): string {
    const formatter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    const separator = "\u2703--------------------------------------------------------------";

    const blocks = items.slice(0, 5).map((item) => {
      const price = formatter.format(item.priceCents / 100);
      const company = (item.company?.name ?? "Empresa local").toUpperCase();
      const address = item.company?.address ?? "Endereco nao informado";
      const validUntil = item.validUntil ? this.formatDateShort(item.validUntil) : null;
      const parts = [
        `> ${price} - ${item.title}`,
        `*${company}*`,
        `\`\`\`${address}\`\`\``,
      ];
      if (validUntil) {
        parts.push(`Valido ate: ${validUntil}`);
      }
      return parts.join("\n");
    });

    const output: string[] = [];
    blocks.forEach((block) => {
      output.push(block);
      output.push(separator);
    });
    return output.join("\n");
  }

  private buildOfferedByTrackingUrl(
    offeredBy: SearchResponse["offeredBy"],
    type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions",
    context?: { cityId?: string | null; nicheId?: string | null; searchType?: "niche" | "company" | "product" }
  ): string | null {
    const baseUrl = ENV.PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl || !offeredBy?.configId || !offeredBy.companyId) {
      logger.info("whatsapp.offered_by.tracking.skip", {
        hasBaseUrl: Boolean(baseUrl),
        hasConfigId: Boolean(offeredBy?.configId),
        hasCompanyId: Boolean(offeredBy?.companyId),
        type,
        searchType: context?.searchType ?? "niche",
      });
      return null;
    }

    const token = createOfferedByTrackingToken(
      {
        configId: offeredBy.configId,
        companyId: offeredBy.companyId,
        type,
        cityId: context?.cityId ?? null,
        nicheId: context?.nicheId ?? null,
        searchType: context?.searchType ?? "niche",
        source: "whatsapp",
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
      ENV.JWT_SECRET
    );

    return `${baseUrl}/offered-by/redirect/${token}`;
  }

  private formatOfferedByText(
    offeredBy: SearchResponse["offeredBy"],
    context?: { cityId?: string | null; nicheId?: string | null; searchType?: "niche" | "company" | "product" }
  ): string {
    if (!offeredBy) return "";
    const lines = [`Oferecido por: ${offeredBy.text}`];

    const whatsappLink =
      this.buildOfferedByTrackingUrl(offeredBy, "click_whatsapp", context) ??
      offeredBy.whatsappE164 ??
      null;
    if (whatsappLink) {
      lines.push(`WhatsApp: ${whatsappLink}`);
    }

    const phoneLink =
      this.buildOfferedByTrackingUrl(offeredBy, "click_call", context) ??
      offeredBy.phoneE164 ??
      null;
    if (phoneLink) {
      lines.push(`Telefone: ${phoneLink}`);
    }

    const siteLink =
      this.buildOfferedByTrackingUrl(offeredBy, "click_site", context) ??
      offeredBy.website ??
      null;
    if (siteLink) {
      lines.push(`Site: ${siteLink}`);
    }

    const promotionsLink =
      this.buildOfferedByTrackingUrl(offeredBy, "click_promotions", context) ??
      offeredBy.promotionsUrl ??
      null;
    if (promotionsLink) {
      lines.push(`Promocoes: ${promotionsLink}`);
    }

    return lines.join("\n");
  }

  private buildOfferedByOptionList(
    offeredBy: SearchResponse["offeredBy"]
  ): { title: string; buttonLabel: string; options: Array<{ id: string; title: string; description?: string }> } | null {
    if (!offeredBy) return null;
    const options: Array<{ id: string; title: string; description?: string }> = [];
    if (offeredBy.whatsappE164) {
      const digits = offeredBy.whatsappE164.replace(/\D/g, "");
      const link = digits ? `https://wa.me/${digits}` : offeredBy.whatsappE164;
      options.push({ id: "whatsapp", title: "WhatsApp", description: link });
    }
    if (offeredBy.phoneE164) {
      options.push({ id: "telefone", title: "Telefone", description: offeredBy.phoneE164 });
    }
    if (offeredBy.website) {
      options.push({ id: "site", title: "Site", description: offeredBy.website });
    }
    if (offeredBy.promotionsUrl) {
      options.push({
        id: "promocoes",
        title: "Promocoes",
        description: offeredBy.promotionsUrl,
      });
    }
    if (!options.length) return null;
    return {
      title: `Oferecido por: ${offeredBy.text}`,
      buttonLabel: "Ver opcoes",
      options,
    };
  }

  private async sendOfferedByMessage(
    to: string,
    offeredBy: SearchResponse["offeredBy"],
    options?: {
      phoneNumberId?: string;
      trackingContext?: { cityId?: string | null; nicheId?: string | null; searchType?: "niche" | "company" | "product" };
    }
  ): Promise<boolean> {
    if (!offeredBy) return false;

    const header = `Oferecido por: ${offeredBy.text}`;
    const optionList = this.buildOfferedByOptionList(offeredBy);
    const hasImage = Boolean(offeredBy.imageUrl);
    logger.info("whatsapp.offered_by.send", {
      phoneMasked: maskPhone(to),
      provider: this.provider,
      hasImage,
      hasOptionList: Boolean(optionList),
      configId: offeredBy.configId ?? null,
      companyId: offeredBy.companyId ?? null,
      trackingContext: options?.trackingContext ?? null,
    });
    if (this.provider === "zapi") {
      if (hasImage && offeredBy.imageUrl) {
        const caption = this.formatOfferedByText(offeredBy, options?.trackingContext);
        logger.info("whatsapp.offered_by.caption", {
          phoneMasked: maskPhone(to),
          provider: this.provider,
          hasImage,
          captionPreview: this.previewReply(caption),
          captionHasTracking: caption.includes("/offered-by/redirect/"),
          baseUrl: ENV.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null,
        });
        return this.safeSendImageZapi(to, offeredBy.imageUrl, caption);
      }
      if (optionList) {
        return this.safeSendOptionListZapi(to, header, optionList);
      }
      const caption = this.formatOfferedByText(offeredBy, options?.trackingContext);
      logger.info("whatsapp.offered_by.caption", {
        phoneMasked: maskPhone(to),
        provider: this.provider,
        hasImage,
        captionPreview: this.previewReply(caption),
        captionHasTracking: caption.includes("/offered-by/redirect/"),
        baseUrl: ENV.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null,
      });
      return this.safeSendText(to, caption);
    }

    const caption = this.formatOfferedByText(offeredBy, options?.trackingContext);
    logger.info("whatsapp.offered_by.caption", {
      phoneMasked: maskPhone(to),
      provider: this.provider,
      hasImage,
      captionPreview: this.previewReply(caption),
      captionHasTracking: caption.includes("/offered-by/redirect/"),
      baseUrl: ENV.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null,
    });
    return this.safeSendText(to, caption, {
      phoneNumberId: options?.phoneNumberId,
    });
  }

  private formatDateShort(value: string): string | null {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleDateString("pt-BR");
  }

  private formatCompanySearchReply(
    rows: Array<{
      company: {
        tradeName?: string | null;
        legalName?: string | null;
        address?: string | null;
        phone?: string | null;
        whatsapp?: string | null;
        openingHours?: string | null;
      };
      city: { name?: string | null; state?: string | null } | null;
      niches?: Array<{ label?: string | null }> | null;
    }>
  ): string {
    const lines = rows.slice(0, 5).map((row) =>
      this.formatDirectCompanyDetails({
        tradeName: row.company.tradeName ?? undefined,
        legalName: row.company.legalName ?? null,
        city: row.city
          ? { name: row.city.name ?? undefined, state: row.city.state ?? undefined }
          : undefined,
        niches: row.niches?.map((niche) => ({ label: niche.label ?? undefined })) ?? [],
        channels: {
          address: row.company.address ?? undefined,
          phone: row.company.phone ?? undefined,
          whatsapp: row.company.whatsapp ?? undefined,
          openingHours: row.company.openingHours ?? undefined,
        },
      })
    );

    return lines.join("\n\n");
  }

  private getAuctionMedal(position: number): string {
    if (position === 1) return "🥇";
    if (position === 2) return "🥈";
    if (position === 3) return "🥉";
    return "";
  }

  private formatShortAddress(address?: string | null): string | null {
    if (!address) return null;
    const trimmed = address.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^([^,]+,\s*\d+)(?:\b|$)/);
    if (match?.[1]) {
      return match[1].trim();
    }
    const [firstPart] = trimmed.split(" - ");
    return (firstPart ?? trimmed).trim();
  }

  private formatPhoneNoLink(value: string): string {
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length > 11) {
      digits = digits.slice(2);
    }
    if (!(digits.length === 10 || digits.length === 11)) {
      return value.trim();
    }
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    const breakToken = "\u200B\u2060";
    const formatted =
      rest.length === 9
        ? `${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`
        : `${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    const withBreaks = formatted.replace(/\d/g, (digit) => `${digit}${breakToken}`);
    return withBreaks.endsWith(breakToken)
      ? withBreaks.slice(0, -breakToken.length)
      : withBreaks;
  }

  private buildPendingOfferedBy(
    offeredBy: SearchResponse["offeredBy"],
    context: { cityId?: string | null; nicheId?: string | null; searchType?: "niche" | "company" | "product" }
  ) {
    if (!offeredBy?.configId || !offeredBy.companyId) return null;

    const options: Array<{
      id: string;
      label: string;
      type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions";
    }> = [];

    if (offeredBy.whatsappE164) {
      options.push({ id: "whatsapp", label: "WhatsApp", type: "click_whatsapp" });
    }
    if (offeredBy.phoneE164) {
      options.push({ id: "telefone", label: "Telefone", type: "click_call" });
    }
    if (offeredBy.website) {
      options.push({ id: "site", label: "Site", type: "click_site" });
    }
    if (offeredBy.promotionsUrl) {
      options.push({ id: "promocoes", label: "Promocoes", type: "click_promotions" });
    }

    if (!options.length) return null;

    return {
      offeredBy: {
        text: offeredBy.text,
        configId: offeredBy.configId,
        companyId: offeredBy.companyId,
        website: offeredBy.website,
        promotionsUrl: offeredBy.promotionsUrl,
        phoneE164: offeredBy.phoneE164,
        whatsappE164: offeredBy.whatsappE164,
      },
      cityId: context.cityId ?? null,
      nicheId: context.nicheId ?? null,
      searchType: context.searchType ?? "niche",
      options,
      createdAt: Date.now(),
    };
  }

  private resolvePendingOfferedByAction(
    messageText: string,
    pending: {
      offeredBy: {
        text: string;
        configId?: string;
        companyId?: string;
        website?: string;
        promotionsUrl?: string;
        phoneE164?: string;
        whatsappE164?: string;
      };
      options: Array<{ id: string; label: string; type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions" }>;
    } | null
  ): { type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions"; replyText?: string } | null {
    if (!pending) return null;
    const normalized = this.normalizeText(messageText);
    if (!normalized) return null;

    const matched = pending.options.find((option) => {
      const label = this.normalizeText(option.label);
      const id = this.normalizeText(option.id);
      return normalized === label || normalized === id || normalized.includes(label);
    });
    if (!matched) return null;

    logger.info("whatsapp.offered_by.resolved", {
      normalized,
      matched: { id: matched.id, label: matched.label, type: matched.type },
    });

    if (matched.type === "click_whatsapp") {
      const raw = pending.offeredBy.whatsappE164 ?? pending.offeredBy.phoneE164 ?? "";
      const digits = this.normalizePhoneForLink(raw);
      const link = digits ? `https://wa.me/${digits}` : raw;
      return { type: matched.type, replyText: link ? `WhatsApp: ${link}` : undefined };
    }

    if (matched.type === "click_call") {
      const raw = pending.offeredBy.phoneE164 ?? "";
      return { type: matched.type, replyText: raw ? `Telefone: ${raw}` : undefined };
    }

    if (matched.type === "click_site") {
      return pending.offeredBy.website
        ? { type: matched.type, replyText: `Site: ${pending.offeredBy.website}` }
        : { type: matched.type };
    }

    if (matched.type === "click_promotions") {
      return pending.offeredBy.promotionsUrl
        ? { type: matched.type, replyText: `Promocoes: ${pending.offeredBy.promotionsUrl}` }
        : { type: matched.type };
    }

    return null;
  }

  private async safeSendOptionListZapi(
    to: string,
    message: string,
    optionList: { title: string; buttonLabel: string; options: Array<{ id: string; title: string; description?: string }> }
  ): Promise<boolean> {
    try {
      await this.sendOptionListZapi(to, message, optionList);
      return true;
    } catch (error) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: {
          reason: "send_option_list_failed",
          phoneMasked: maskPhone(to),
          error: (error as Error).message,
        },
      });
      return false;
    }
  }

  private async safeSendImageZapi(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<boolean> {
    try {
      await this.sendImageZapi(to, imageUrl, caption);
      return true;
    } catch (error) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: {
          reason: "send_image_failed",
          phoneMasked: maskPhone(to),
          error: (error as Error).message,
        },
      });
      return false;
    }
  }

  private async sendZapiSearchResults(
    to: string,
    query: string,
    searchResponse: SearchResponse,
    options?: { direct?: boolean }
  ): Promise<boolean> {
    const reply = this.formatSearchReply(query, searchResponse, options);
    if (!reply) {
      return this.safeSendText(to, `Nao encontrei resultados para "${query}".`);
    }

    const sent = await this.safeSendText(to, reply);
    await this.sendOfferedByMessage(to, searchResponse.offeredBy);
    return sent;
  }

  private async sendText(
    to: string,
    message: string,
    options?: { phoneNumberId?: string }
  ): Promise<void> {
    if (this.provider === "meta") {
      await this.sendTextMeta(to, message, options?.phoneNumberId);
      return;
    }

    if (this.provider === "zapi") {
      await this.sendTextZapi(to, message);
      return;
    }

    await this.sendTextGeneric(to, message);
  }

  async sendTestMessage(to: string, message: string): Promise<void> {
    await this.sendText(to, message);
  }

  private resolveZapiUrl(
    action: "send-text" | "send-option-list" | "send-image"
  ): string | null {
    const raw = ENV.WHATSAPP_API_URL?.trim();
    if (raw) {
      const base = raw.replace(/\/$/, "");
      if (
        base.endsWith("/send-text") ||
        base.endsWith("/send-option-list") ||
        base.endsWith("/send-image")
      ) {
        return base.replace(/\/send-(text|option-list|image)$/, `/${action}`);
      }
      return `${base}/${action}`;
    }
    if (!ENV.ZAPI_BASE_URL || !ENV.ZAPI_INSTANCE_ID || !ENV.ZAPI_INSTANCE_TOKEN) {
      return null;
    }
    const base = ENV.ZAPI_BASE_URL.replace(/\/$/, "");
    return `${base}/instances/${ENV.ZAPI_INSTANCE_ID}/token/${ENV.ZAPI_INSTANCE_TOKEN}/${action}`;
  }

  private async sendTextZapi(to: string, message: string): Promise<void> {
    const url = this.resolveZapiUrl("send-text");
    if (!url) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "zapi_config_missing", phoneMasked: maskPhone(to) },
      });
      return;
    }

    const clientToken = ENV.ZAPI_CLIENT_TOKEN?.trim();
    if (!clientToken) {
      throw new AppError(500, "zapi_client_token_required");
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    headers["Client-Token"] = clientToken;
    const startedAt = Date.now();

    try {
      await this.auditService.logEvent({
        type: "whatsapp.send.start",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          url,
        },
      });
      const response = await this.httpClient.post(
        url,
        { phone: to, message },
        {
          headers,
          timeout: 5000,
        }
      );
      await this.auditService.logEvent({
        type: "zapi_send_success",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          status: response.status,
          reason: "send_text",
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const status = axiosError?.response?.status ?? null;
      await this.auditService.logEvent({
        type: "zapi_send_failure",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          status,
          reason: "send_text_failed",
          error: (axiosError ?? (error as Error)).message,
          code: axiosError?.code ?? null,
          isAxiosError: Boolean(axiosError),
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  }

  private async sendImageZapi(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<void> {
    const url = this.resolveZapiUrl("send-image");
    if (!url) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "zapi_config_missing", phoneMasked: maskPhone(to) },
      });
      return;
    }

    const clientToken = ENV.ZAPI_CLIENT_TOKEN?.trim();
    if (!clientToken) {
      throw new AppError(500, "zapi_client_token_required");
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    headers["Client-Token"] = clientToken;
    const startedAt = Date.now();

    try {
      await this.auditService.logEvent({
        type: "whatsapp.send.start",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          url,
        },
      });
      const response = await this.httpClient.post(
        url,
        {
          phone: to,
          image: imageUrl,
          ...(caption ? { caption } : {}),
        },
        {
          headers,
          timeout: 5000,
        }
      );
      await this.auditService.logEvent({
        type: "zapi_send_success",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          status: response.status,
          reason: "send_image",
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const status = axiosError?.response?.status ?? null;
      await this.auditService.logEvent({
        type: "zapi_send_failure",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(to),
          status,
          reason: "send_image_failed",
          error: (axiosError ?? (error as Error)).message,
          code: axiosError?.code ?? null,
          isAxiosError: Boolean(axiosError),
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  }

  async sendOptionListZapi(
    phone: string,
    message: string,
    optionList: { title: string; buttonLabel: string; options: Array<{ id: string; title: string; description?: string }> }
  ): Promise<void> {
    const url = this.resolveZapiUrl("send-option-list");
    if (!url) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "zapi_config_missing", phoneMasked: maskPhone(phone) },
      });
      return;
    }

    const clientToken = ENV.ZAPI_CLIENT_TOKEN?.trim();
    if (!clientToken) {
      throw new AppError(500, "zapi_client_token_required");
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    headers["Client-Token"] = clientToken;

    const normalizedOptions = optionList.options.map((option, index) => ({
      id: option.id || String(index + 1),
      title: option.title,
      ...(option.description ? { description: option.description } : {}),
    }));
    const startedAt = Date.now();

    try {
      await this.auditService.logEvent({
        type: "whatsapp.send.start",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(phone),
          url,
        },
      });
      const response = await this.httpClient.post(
        url,
        {
          phone,
          message,
          optionList: {
            title: optionList.title,
            buttonLabel: optionList.buttonLabel,
            options: normalizedOptions,
          },
        },
        {
          headers,
          timeout: 5000,
        }
      );
      await this.auditService.logEvent({
        type: "zapi_send_success",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(phone),
          status: response.status,
          reason: "send_option_list",
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const status = axiosError?.response?.status ?? null;
      await this.auditService.logEvent({
        type: "zapi_send_failure",
        payload: {
          provider: "zapi",
          phoneMasked: maskPhone(phone),
          status,
          reason: "send_option_list_failed",
          error: (axiosError ?? (error as Error)).message,
          code: axiosError?.code ?? null,
          isAxiosError: Boolean(axiosError),
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  }

  private async sendTextGeneric(to: string, message: string): Promise<void> {
    if (!this.apiBaseUrl || !this.apiToken) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "whatsapp_config_missing", phoneMasked: maskPhone(to) },
      });
      return;
    }

    await this.httpClient.post(
      `${this.apiBaseUrl}/message/text`,
      { phone: to, message },
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );
  }

  private async sendTextMeta(
    to: string,
    message: string,
    phoneNumberId?: string
  ): Promise<void> {
    if (!this.apiToken) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "whatsapp_config_missing", phoneMasked: maskPhone(to) },
      });
      return;
    }

    const resolvedPhoneNumberId =
      phoneNumberId ?? ENV.WHATSAPP_META_PHONE_NUMBER_ID;
    if (!resolvedPhoneNumberId) {
      await this.auditService.logEvent({
        type: "webhook_failure",
        payload: { reason: "whatsapp_phone_number_missing", phoneMasked: maskPhone(to) },
      });
      return;
    }

    const version = ENV.WHATSAPP_META_API_VERSION || "v20.0";
    const url = `https://graph.facebook.com/${version}/${resolvedPhoneNumberId}/messages`;

    await this.httpClient.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );
  }

  private async safeSendText(
    to: string,
    message: string,
    options?: { phoneNumberId?: string | null }
  ): Promise<boolean> {
    this.purgeExpiredMessages();
    const outboundDedupeKey = this.buildOutboundDedupeKey(to, message);
    if (this.isOutboundDuplicate(outboundDedupeKey)) {
      return true;
    }
    this.markOutboundProcessed(outboundDedupeKey);

    for (let attempt = 0; attempt < OUTBOUND_MAX_RETRIES; attempt += 1) {
      try {
        await this.sendText(to, message, { phoneNumberId: options?.phoneNumberId ?? undefined });
        return true;
      } catch (error) {
        if (attempt === OUTBOUND_MAX_RETRIES - 1) {
          await this.auditService.logEvent({
            type: "webhook_failure",
              payload: {
                reason: "send_text_failed",
                phoneMasked: maskPhone(to),
                attempts: OUTBOUND_MAX_RETRIES,
                error: (error as Error).message,
              },
          });
          return false;
        }

        const jitter = Math.floor(Math.random() * 150);
        const delayMs = OUTBOUND_RETRY_BASE_DELAY_MS * (attempt + 1) + jitter;
        await this.sleep(delayMs);
      }
    }

    return false;
  }

  private async recordMessageHistory(params: {
    searchResponse: SearchResponse;
    peerE164: string;
    providerMessageId: string | null;
    inboundText: string;
    outboundText: string;
    phoneNumberId: string | null;
    query: string;
    city: string | null;
    sendStatus: "sent" | "failed";
  }) {
    const companyIds = [
      ...new Set(
        (params.searchResponse.results ?? [])
          .map((result) => result.company?.id)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    if (!companyIds.length) {
      return;
    }

    const entries: MessageHistoryEntry[] = [];
    const metaBase = {
      source: "whatsapp",
      city: params.city,
      query: params.query,
      phoneNumberId: params.phoneNumberId,
    };

    for (const companyId of companyIds) {
      entries.push({
        companyId,
        direction: "inbound",
        peerE164: params.peerE164,
        providerMessageId: params.providerMessageId,
        text: params.inboundText,
        searchId: params.searchResponse.searchId ?? null,
        meta: metaBase,
      });
      entries.push({
        companyId,
        direction: "outbound",
        peerE164: params.peerE164,
        providerMessageId: null,
        text: params.outboundText,
        searchId: params.searchResponse.searchId ?? null,
        meta: { ...metaBase, sendStatus: params.sendStatus },
      });
    }

    await this.messagesService?.recordMany(entries);
  }

  private async recordWhatsappContacts(params: {
    reason: string;
    phone: string;
    messageId: string | null;
    companyIds: Array<{ companyId: string; nicheId: string | null }>;
  }): Promise<void> {
    if (!this.contactService) {
      return;
    }
    const unique = new Map(
      params.companyIds
        .filter((entry) => entry.companyId)
        .map((entry) => [entry.companyId, entry])
    );
    if (unique.size === 0) {
      return;
    }

    logger.info("whatsapp.contact.record.start", {
      reason: params.reason,
      phoneMasked: maskPhone(params.phone),
      messageId: params.messageId,
      companyCount: unique.size,
    });

    try {
      await Promise.all(
        [...unique.values()].map((entry) =>
          this.contactService?.recordContact({
            companyId: entry.companyId,
            channel: "whatsapp",
            phone: params.phone,
            name: null,
            nicheId: entry.nicheId ?? null,
            createdAt: new Date(),
          })
        )
      );
      logger.info("whatsapp.contact.record.done", {
        reason: params.reason,
        phoneMasked: maskPhone(params.phone),
        messageId: params.messageId,
        companyCount: unique.size,
      });
    } catch (error) {
      logger.info("whatsapp.contact.record.failed", {
        reason: params.reason,
        phoneMasked: maskPhone(params.phone),
        messageId: params.messageId,
        error: (error as Error).message,
      });
    }
  }

  private async resolveCityAndQuery(
    text: string,
    sessionCity: string | null
  ): Promise<{
    city: string | null;
    query: string;
    cleanedQuery: string;
    tokens: string[];
    cityOnly: boolean;
    branch: string;
  }> {
    const raw = text.trim();
    if (!raw) {
      return {
        city: null,
        query: "",
        cleanedQuery: "",
        tokens: [],
        cityOnly: false,
        branch: "empty_text",
      };
    }

    const explicitMatch = raw.match(/cidade\s*[:=]\s*([^\n;]+)/i);
    let city: string | null = null;
    let query = raw;
    let cityOnly = false;
    let branch = "missing_city";

    if (explicitMatch) {
      city = explicitMatch[1]?.trim() || null;
      const before = raw.slice(0, explicitMatch.index ?? 0).trim();
      const afterRaw = raw.slice((explicitMatch.index ?? 0) + explicitMatch[0].length);
      const after = afterRaw.replace(/^[;,\-]\s*/, "").trim();
      query = [before, after].filter(Boolean).join("\n").trim();
      branch = "explicit_city";
    } else {
      const cityNames = await this.listCityNames();
      const match = this.matchCityFromSuffix(raw, cityNames);
      if (match) {
        city = match.city;
        query = match.query;
        cityOnly = !query;
        branch = cityOnly ? "city_only" : "suffix_city";
      }
    }

    if (!city && sessionCity) {
      city = sessionCity;
      query = raw;
      branch = "session_city";
    }

    query = this.cleanupQuery(query);

    if (!city) {
      const fallback = ENV.DEFAULT_CITY_NAME?.trim();
      if (fallback) {
        city = fallback;
        query = raw;
        branch = "default_city";
      }
    }

    if (!query) {
      cityOnly = true;
      branch = branch === "missing_city" ? "city_only" : branch;
    }

    const cleaned = this.cleanQueryForSearch(query);
    const cleanedQuery = cleaned.cleanedQuery;
    const tokens = cleaned.tokens;
    if (!cleanedQuery) {
      cityOnly = true;
      branch = branch === "missing_city" ? "city_only" : branch;
    }

    return { city, query, cleanedQuery, tokens, cityOnly, branch };
  }

  private cleanupQuery(value: string): string {
    let cleaned = (value ?? "").trim();
    cleaned = cleaned.replace(/[,\-;:.]+$/g, "").trim();

    const trailing = /\b(em|no|na|nos|nas|de|do|da|dos|das|para|pra|por|e)\s*$/i;
    while (trailing.test(cleaned)) {
      cleaned = cleaned.replace(trailing, "").trim();
    }

    return cleaned;
  }

  private cleanQueryForSearch(value: string): { cleanedQuery: string; tokens: string[] } {
    const cleaned = this.cleanupQuery(value);
    const parsed = cleanSearchText(cleaned);
    return { cleanedQuery: parsed.cleaned, tokens: parsed.tokens };
  }

  private matchCityFromSuffix(
    text: string,
    cityNames: string[]
  ): { city: string; query: string } | null {
    const rawTokens = text.trim().split(/\s+/).filter(Boolean);
    if (!rawTokens.length) {
      return null;
    }
    const normalizedTokens = rawTokens.map((token) => this.normalizeToken(token));

    const cityTokenSets = cityNames
      .map((name) => ({
        city: name,
        tokens: name
          .trim()
          .split(/\s+/)
          .map((token) => this.normalizeToken(token))
          .filter(Boolean),
      }))
      .filter((entry) => entry.tokens.length > 0)
      .sort((a, b) => b.tokens.length - a.tokens.length);

    for (const entry of cityTokenSets) {
      if (normalizedTokens.length < entry.tokens.length) continue;
      const start = normalizedTokens.length - entry.tokens.length;
      const suffix = normalizedTokens.slice(start);
      const matches = suffix.every((token, idx) => token === entry.tokens[idx]);
      if (!matches) continue;
      const queryTokens = rawTokens.slice(0, start);
      return {
        city: entry.city,
        query: queryTokens.join("\n").trim(),
      };
    }

    return null;
  }

  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private normalizeToken(token: string): string {
    const trimmed = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    return this.normalizeText(trimmed);
  }

  private async listCityNames(): Promise<string[]> {
    const rows = await db.select({ name: cities.name }).from(cities);
    return rows.map((row) => row.name).filter(Boolean);
  }

  private async findNicheIdByLabel(label: string): Promise<string | null> {
    const safeLabel = label.trim();
    if (!safeLabel) return null;
    const [row] = await db
      .select({ id: niches.id })
      .from(niches)
      .where(ilike(niches.label, safeLabel))
      .limit(1);
    return row?.id ?? null;
  }

  private getSession(from: string): {
    city: string;
    nichePreferences?: Record<string, string>;
    lastSearchReply?: string;
    lastSearchQueryKey?: string;
    pendingActionMenu?: {
      options: Array<{ id: string; label: string; action: "new_search" | "resend" | "end" }>;
      createdAt: number;
    };
    pendingNicheChoices?: {
      queryKey: string;
      cleanedQuery: string;
      options: Array<{ id: string; label: string }>;
      createdAt: number;
    };
    pendingOfferedBy?: {
      offeredBy: {
        text: string;
        configId?: string;
        companyId?: string;
        website?: string;
        promotionsUrl?: string;
        phoneE164?: string;
        whatsappE164?: string;
      };
      cityId?: string | null;
      nicheId?: string | null;
      searchType?: "niche" | "company" | "product";
      options: Array<{ id: string; label: string; type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions" }>;
      createdAt: number;
    };
  } | null {
    const entry = whatsappSessions.get(from);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
      whatsappSessions.delete(from);
      return null;
    }
    return {
      city: entry.city,
      nichePreferences: entry.nichePreferences,
      lastSearchReply: entry.lastSearchReply,
      lastSearchQueryKey: entry.lastSearchQueryKey,
      pendingActionMenu: entry.pendingActionMenu,
      pendingNicheChoices: entry.pendingNicheChoices,
      pendingOfferedBy: entry.pendingOfferedBy,
    };
  }

  private setSession(
    from: string,
    city: string,
    updates?: {
      nichePreferences?: Record<string, string>;
      lastSearchReply?: string | null;
      lastSearchQueryKey?: string | null;
      pendingActionMenu?: {
        options: Array<{ id: string; label: string; action: "new_search" | "resend" | "end" }>;
        createdAt: number;
      };
      pendingNicheChoices?: {
        queryKey: string;
        cleanedQuery: string;
        options: Array<{ id: string; label: string }>;
        createdAt: number;
      };
      pendingOfferedBy?: {
        offeredBy: {
          text: string;
          configId?: string;
          companyId?: string;
          website?: string;
          promotionsUrl?: string;
          phoneE164?: string;
          whatsappE164?: string;
        };
        cityId?: string | null;
        nicheId?: string | null;
        searchType?: "niche" | "company" | "product";
      options: Array<{ id: string; label: string; type: "click_whatsapp" | "click_call" | "click_site" | "click_promotions" }>;
        createdAt: number;
      } | null;
    }
  ) {
    const current = whatsappSessions.get(from);
    whatsappSessions.set(from, {
      city,
      updatedAt: Date.now(),
      nichePreferences: updates?.nichePreferences ?? current?.nichePreferences,
      lastSearchReply:
        updates?.lastSearchReply === null
          ? undefined
          : updates?.lastSearchReply ?? current?.lastSearchReply,
      lastSearchQueryKey:
        updates?.lastSearchQueryKey === null
          ? undefined
          : updates?.lastSearchQueryKey ?? current?.lastSearchQueryKey,
      pendingActionMenu: updates?.pendingActionMenu ?? current?.pendingActionMenu,
      pendingNicheChoices:
        updates?.pendingNicheChoices ?? current?.pendingNicheChoices,
      pendingOfferedBy:
        updates?.pendingOfferedBy === null
          ? undefined
          : updates?.pendingOfferedBy ?? current?.pendingOfferedBy,
    });
  }

  private isAmbiguousNicheMatch(candidates: Array<{ score: number }>): boolean {
    if (candidates.length < 2) return false;
    const [first, second] = candidates;
    if (!first || !second) return false;
    const diff = first.score - second.score;
    return diff <= 1 || second.score >= first.score * 0.8;
  }

  private isResendRequest(text: string): boolean {
    const normalized = this.normalizeText(text);
    if (!normalized) return false;
    return [
      "ver novamente",
      "me mande novamente",
      "pode me enviar de novo",
      "envie de novo",
      "envie mais uma vez",
      "pode enviar",
      "manda de novo",
      "manda novamente",
      "reenvie",
      "reenviar",
    ].some((pattern) => normalized.includes(pattern));
  }

  private isActionKeyword(text: string): boolean {
    const normalized = this.normalizeText(text);
    if (!normalized) return false;
    return [
      "whatsapp",
      "ligar",
      "telefone",
      "tel",
      "opcoes",
      "opcoes",
      "menu",
      "ver opcoes",
      "ver opcoes",
    ].some((keyword) => normalized.includes(keyword));
  }

  private resolvePendingActionMenu(
    messageText: string,
    pending: {
      options: Array<{ id: string; label: string; action: "new_search" | "resend" | "end" }>;
    } | null
  ): { action: "new_search" | "resend" | "end" } | null {
    if (!pending) return null;
    const trimmed = messageText.trim();
    if (!trimmed) return null;
    const normalized = this.normalizeText(trimmed);

    const numeric = trimmed.match(/^\d+$/);
    if (numeric) {
      const index = Number(trimmed) - 1;
      const chosen = pending.options[index];
      if (chosen) {
        return { action: chosen.action };
      }
    }

    const matched = pending.options.find(
      (option) => this.normalizeText(option.label) === normalized
    );
    if (matched) {
      return { action: matched.action };
    }

    return null;
  }

  private async promptActionMenu(
    to: string,
    city: string,
    options?: { phoneNumberId?: string | null }
  ): Promise<void> {
    const items = [
      { id: "1", title: "Nova busca", action: "new_search" as const },
      { id: "2", title: "Ver empresas novamente", action: "resend" as const },
      { id: "3", title: "Encerrar", action: "end" as const },
    ];

    this.setSession(to, city, {
      pendingActionMenu: {
        options: items.map((item) => ({ id: item.id, label: item.title, action: item.action })),
        createdAt: Date.now(),
      },
    });

    logger.info("whatsapp.reply.chosen", {
      replyType: "prompt_action_menu",
      replyPreview: "O que voce quer fazer?",
      reason: "action_menu",
    });

    if (this.provider === "zapi") {
      const sent = await this.safeSendOptionListZapi(to, "O que voce quer fazer?", {
        title: "Menu rapido",
        buttonLabel: "Ver opcoes",
        options: items.map((item) => ({ id: item.id, title: item.title })),
      });
      if (sent) {
        return;
      }
    }

    const textList = items.map((item) => `${item.id}) ${item.title}`).join("\n");
    await this.safeSendText(to, `O que voce quer fazer?\n${textList}`, {
      phoneNumberId: options?.phoneNumberId ?? undefined,
    });
  }

  private pickDefaultNiche(
    candidates: Array<{
      score: number;
      hasActiveAuction: boolean;
      companyCount: number;
      label: string;
    }>
  ) {
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => {
      const bonusA = (a.hasActiveAuction ? 2 : 0) + Math.min(a.companyCount, 10) / 10;
      const bonusB = (b.hasActiveAuction ? 2 : 0) + Math.min(b.companyCount, 10) / 10;
      const scoreA = a.score + bonusA;
      const scoreB = b.score + bonusB;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.companyCount - a.companyCount;
    })[0];
  }

  private resolvePendingNicheChoice(
    messageText: string,
    pending: { queryKey: string; cleanedQuery: string; options: Array<{ id: string; label: string }> } | null
  ): { queryKey: string; cleanedQuery: string; label: string } | null {
    if (!pending) return null;
    const trimmed = messageText.trim();
    if (!trimmed) return null;
    const normalized = this.normalizeText(trimmed);

    const numeric = trimmed.match(/^\d+$/);
    if (numeric) {
      const index = Number(trimmed) - 1;
      const chosen = pending.options[index];
      if (chosen) {
        return { queryKey: pending.queryKey, cleanedQuery: pending.cleanedQuery, label: chosen.label };
      }
    }

    const matched = pending.options.find(
      (option) => this.normalizeText(option.label) === normalized
    );
    if (matched) {
      return { queryKey: pending.queryKey, cleanedQuery: pending.cleanedQuery, label: matched.label };
    }

    return null;
  }

  private async promptNicheChoice(
    to: string,
    city: string,
    queryKey: string,
    cleanedQuery: string,
    candidates: Array<{ nicheId: string; label: string }>,
    options?: { phoneNumberId?: string | null }
  ): Promise<void> {
    const optionsList = candidates.slice(0, 5).map((candidate, index) => ({
      id: String(index + 1),
      title: candidate.label,
    }));
    const textList = candidates
      .slice(0, 5)
      .map((candidate, index) => `${index + 1}) ${candidate.label}`)
      .join("\n");

    this.setSession(to, city, {
      pendingNicheChoices: {
        queryKey,
        cleanedQuery,
        options: optionsList.map((opt) => ({ id: opt.id, label: opt.title })),
        createdAt: Date.now(),
      },
    });

    logger.info("whatsapp.reply.chosen", {
      replyType: "prompt_niche_choice",
      replyPreview: "Qual nicho especifico voce quer?",
      reason: "niche_ambiguous",
    });

    if (this.provider === "zapi") {
      const sent = await this.safeSendOptionListZapi(to, "Qual nicho especifico voce quer?", {
        title: "Escolha um nicho",
        buttonLabel: "Ver nichos",
        options: optionsList,
      });
      if (sent) {
        return;
      }
    }

    await this.safeSendText(
      to,
      `Qual nicho especifico voce quer?\n${textList}`,
      { phoneNumberId: options?.phoneNumberId ?? undefined }
    );
  }

  private previewReply(message: string): string {
    const clean = message.replace(/\s+/g, " ").trim();
    if (clean.length <= 120) {
      return clean;
    }
    return `${clean.slice(0, 117)}...`;
  }

  private isProductIntent(query: string, tokens: string[]): boolean {
    const normalized = this.normalizeText(query);
    if (!normalized) {
      return false;
    }

    const productKeywords = new Set([
      "coca-cola",
      "coca",
      "refrigerante",
      "cerveja",
      "agua",
      "cafe",
      "acucar",
      "arroz",
      "feijao",
      "leite",
      "oleo",
      "macarrao",
      "farinha",
      "sal",
      "margarina",
      "manteiga",
      "queijo",
      "presunto",
      "pao",
      "biscoito",
      "iogurte",
      "suco",
      "achocolatado",
      "aveia",
      "cereal",
      "molho",
      "ketchup",
      "maionese",
      "mostarda",
      "atum",
      "sardinha",
      "milho",
      "ervilha",
      "lentilha",
      "grao-de-bico",
      "fuba",
      "mel",
      "geleia",
      "chocolate",
      "bolo",
      "pizza",
      "hamburguer",
      "nuggets",
      "lasanha",
      "batata",
      "downy",
      "triex",
    ]);

    const serviceKeywords = new Set([
      "advogado",
      "desenvolvedor",
      "dentista",
      "medico",
      "psicologo",
      "psicologa",
      "engenheiro",
      "professor",
      "arquiteto",
      "terapeuta",
      "contabilidade",
      "contador",
    ]);

    if (tokens.some((token) => serviceKeywords.has(token))) {
      return false;
    }

    if (tokens.some((token) => productKeywords.has(token))) {
      return true;
    }

    const unitRegex = /\b\d+(?:[.,]\d+)?\s?(kg|g|ml|l|lt|litro|litros)\b/;
    if (unitRegex.test(normalized)) {
      return true;
    }

    return false;
  }

  private isDisambiguationResponse(
    response: SearchResponse
  ): response is SearchResponse & { needsDisambiguation: true; nicheOptions: Array<{ nicheId: string; label: string }> } {
    return Boolean((response as any)?.needsDisambiguation && Array.isArray((response as any)?.nicheOptions));
  }

  private isDirectCompanySearch(query: string, searchResponse: SearchResponse): boolean {
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 8) {
      return true;
    }

    const addressTokens = new Set([
      "rua",
      "av",
      "avenida",
      "travessa",
      "estrada",
      "rodovia",
      "alameda",
      "bairro",
      "numero",
      "n",
      "nº",
    ]);
    const tokens = this.cleanQueryForSearch(query).tokens;
    if (tokens.some((token) => addressTokens.has(token))) {
      return true;
    }

    const normalizedQuery = this.normalizeText(query);
    if (!normalizedQuery) {
      return false;
    }

    return (searchResponse.results ?? []).some((result) => {
      const name = this.normalizeText(result.company?.tradeName ?? "");
      if (!name) return false;
      if (name === normalizedQuery) return true;
      if (tokens.length >= 2) {
        return tokens.every((token) => name.includes(token));
      }
      return false;
    });
  }

  private async isLikelyCompanyQuery(
    text: string,
    cityId: string | null
  ): Promise<boolean> {
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 8) {
      return true;
    }

    if (text.includes("'") || text.includes("’")) {
      return true;
    }

    const addressTokens = new Set([
      "rua",
      "av",
      "avenida",
      "travessa",
      "estrada",
      "rodovia",
      "alameda",
      "bairro",
      "numero",
      "n",
    ]);
    const tokens = this.cleanQueryForSearch(text).tokens;
    if (tokens.some((token) => addressTokens.has(token))) {
      return true;
    }

    if (!this.companiesRepository) {
      return false;
    }

    const normalizedQuery = this.normalizeText(text);
    const candidates = await this.companiesRepository.searchCompaniesByName({
      query: text,
      cityId: cityId ?? undefined,
      limit: 3,
    });
    const hasStrongMatch = candidates.some((candidate) => {
      const name = this.normalizeText(candidate.company?.tradeName ?? "");
      if (!name) return false;
      if (normalizedQuery && name === normalizedQuery) return true;
      if (tokens.length >= 2) {
        return tokens.every((token) => name.includes(token));
      }
      return false;
    });
    if (hasStrongMatch) {
      return true;
    }

    if (cityId) {
      const fallback = await this.companiesRepository.searchCompaniesByName({
        query: text,
        limit: 3,
      });
      return fallback.some((candidate) => {
        const name = this.normalizeText(candidate.company?.tradeName ?? "");
        if (!name) return false;
        if (normalizedQuery && name === normalizedQuery) return true;
        if (tokens.length >= 2) {
          return tokens.every((token) => name.includes(token));
        }
        return false;
      });
    }

    return false;
  }

  private formatDirectCompanyDetails(company?: {
    tradeName?: string;
    legalName?: string | null;
    city?: { name?: string; state?: string };
    niches?: Array<{ label?: string }>;
    channels?: {
      address?: string;
      phone?: string;
      whatsapp?: string;
      openingHours?: string;
    };
  }): string {
    if (!company) {
      return "Empresa";
    }

    const lines: string[] = [];
    const name = company.tradeName ?? "Empresa";
    lines.push(`*${name}* ???`);

    const cityLabel =
      company.city?.name
        ? company.city.state
          ? `${company.city.name} - ${company.city.state}`
          : company.city.name
        : null;
    if (company.channels?.address) {
      const hasCity = cityLabel
        ? company.channels.address.toLowerCase().includes(cityLabel.toLowerCase())
        : false;
      const addressLine = cityLabel && !hasCity
        ? `${company.channels.address} - ${cityLabel}`
        : company.channels.address;
      lines.push(`\`\`\`Endereco: ${addressLine}\`\`\``);
    } else if (cityLabel) {
      lines.push(`\`\`\`Endereco: ${cityLabel}\`\`\``);
    }
    if (company.channels?.phone) {
      lines.push(`> Telefone: ${company.channels.phone}`);
    }
    if (company.channels?.whatsapp) {
      lines.push(`> WhatsApp: ${company.channels.whatsapp}`);
    }

    if (company.niches?.length) {
      const labels = company.niches.map((niche) => niche.label).filter(Boolean);
      if (labels.length) {
        lines.push(" ");
        labels.forEach((label, index) => {
          lines.push(`${index + 1}. ${label}`);
        });
      }
    }

    return lines.filter(Boolean).join("\n");
  }

  private normalizePhoneForLink(value: string): string | null {
    const digits = value.replace(/\D/g, "");
    return digits ? digits : null;
  }

  private async resolveWhatsAppContext(
    text: string
  ): Promise<{ cityId: string; nicheId: string } | null> {
    const defaultCityId = ENV.WHATSAPP_DEFAULT_CITY_ID;
    const defaultNicheId = ENV.WHATSAPP_DEFAULT_NICHE_ID;

    const [defaultCity] = defaultCityId
      ? await db.select().from(cities).where(eq(cities.id, defaultCityId)).limit(1)
      : [];
    let city = defaultCity;

    if (!city) {
      [city] = await db.select().from(cities).orderBy(asc(cities.name)).limit(1);
    }

    const [defaultNiche] = defaultNicheId
      ? await db.select().from(niches).where(eq(niches.id, defaultNicheId)).limit(1)
      : [];
    let niche = defaultNiche;

    if (!niche) {
      [niche] = await db
        .select()
        .from(niches)
        .where(ilike(niches.label, "Geral"))
        .limit(1);
    }

    if (!niche) {
      [niche] = await db
        .select()
        .from(niches)
        .where(ilike(niches.slug, "geral"))
        .limit(1);
    }

    if (!niche) {
      [niche] = await db.select().from(niches).orderBy(asc(niches.label)).limit(1);
    }

    if (!city || !niche) {
      return null;
    }

    const cityFromText = this.extractCityFromText(text);
    if (cityFromText) {
      const safeCity = cityFromText.replace(/[%_]/g, "").trim();
      if (!safeCity) {
        return { cityId: city.id, nicheId: niche.id };
      }
      const [matched] = await db
        .select()
        .from(cities)
        .where(ilike(cities.name, `%${safeCity}%`))
        .orderBy(asc(cities.name))
        .limit(1);
      if (matched) {
        city = matched;
      }
    }

    return { cityId: city.id, nicheId: niche.id };
  }

  private extractCityFromText(text: string): string | null {
    const match = text.match(/\bem\s+([^,\n;]+)/i);
    if (!match) {
      return null;
    }

    const value = match[1]?.trim();
    if (!value) {
      return null;
    }

    return value.replace(/[.?]$/, "").trim();
  }

  private buildDedupeKey(message: WhatsappInboundMessage): string {
    return message.messageId || `${message.from}-${message.text}`;
  }

  private isDuplicate(key: string): boolean {
    const now = Date.now();
    const expiresAt = processedMessages.get(key);
    return typeof expiresAt === "number" && expiresAt > now;
  }

  private markProcessed(key: string): void {
    processedMessages.set(key, Date.now() + DEDUPE_TTL_MS);
  }

  private buildOutboundDedupeKey(to: string, message: string): string {
    return `${to}:${this.simpleHash(message)}`;
  }

  private isOutboundDuplicate(key: string): boolean {
    const now = Date.now();
    const expiresAt = processedOutboundMessages.get(key);
    return typeof expiresAt === "number" && expiresAt > now;
  }

  private markOutboundProcessed(key: string): void {
    processedOutboundMessages.set(key, Date.now() + OUTBOUND_DEDUPE_TTL_MS);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private simpleHash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return `${hash}`;
  }

  private purgeExpiredMessages(): void {
    const now = Date.now();
    for (const [key, expiresAt] of processedMessages.entries()) {
      if (expiresAt <= now) {
        processedMessages.delete(key);
      }
    }
    for (const [key, expiresAt] of processedOutboundMessages.entries()) {
      if (expiresAt <= now) {
        processedOutboundMessages.delete(key);
      }
    }
  }
}
