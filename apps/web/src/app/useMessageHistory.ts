import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export type MessageHistoryItem = {
  id: string;
  companyId: string;
  direction: "inbound" | "outbound";
  peerE164: string;
  providerMessageId: string | null;
  text: string;
  searchId: string | null;
  meta?: unknown;
  createdAt: string;
};

type MessageHistoryResponse = {
  items: MessageHistoryItem[];
  nextOffset: number | null;
};

export const useMessageHistory = (
  peerE164?: string | null,
  opts?: { limit?: number }
) =>
  useQuery<MessageHistoryResponse>({
    queryKey: ["message-history", peerE164, opts?.limit],
    enabled: Boolean(peerE164),
    queryFn: async () => {
      if (!peerE164) {
        throw new Error("peer_required");
      }

      const res = await apiClient.get<MessageHistoryResponse>("/messages/history", {
        params: {
          peerE164,
          limit: opts?.limit ?? 40,
          offset: 0,
        },
      });
      return res.data;
    },
  });
