import { and, count, eq, gte } from "drizzle-orm";

import { db, type DatabaseClient } from "../../core/database/client";
import {
  customerComplaints,
  type ComplaintRecord,
} from "./complaints.schema";

type ComplaintInsert = typeof customerComplaints.$inferInsert;

export class ComplaintsRepository {
  constructor(private readonly database: DatabaseClient = db) {}

  async createComplaint(payload: ComplaintInsert): Promise<ComplaintRecord> {
    const [record] = await this.database
      .insert(customerComplaints)
      .values(payload)
      .returning();

    return record;
  }

  async countComplaintsByCompany(
    companyId: string,
    params?: { since?: Date }
  ): Promise<number> {
    const [row] = await this.database
      .select({ value: count() })
      .from(customerComplaints)
      .where(
        params?.since
          ? and(
              eq(customerComplaints.companyId, companyId),
              gte(customerComplaints.createdAt, params.since)
            )
          : eq(customerComplaints.companyId, companyId)
      );

    return Number(row?.value ?? 0);
  }

  async countComplaintsByCompanyAndHashSince(
    companyId: string,
    customerHash: string,
    since: Date
  ): Promise<number> {
    const [row] = await this.database
      .select({ value: count() })
      .from(customerComplaints)
      .where(
        and(
          eq(customerComplaints.companyId, companyId),
          eq(customerComplaints.customerHash, customerHash),
          gte(customerComplaints.createdAt, since)
        )
      );

    return Number(row?.value ?? 0);
  }
}
