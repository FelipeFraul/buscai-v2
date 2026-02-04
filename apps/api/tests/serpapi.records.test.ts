import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("../src/core/database/client", () => ({
  db: {
    select: selectMock,
  },
}));

const createBuilder = (result: unknown) => {
  const builder = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: (onFulfilled: any, onRejected?: any) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
};

import { SerpapiRepository } from "../src/modules/serpapi/serpapi.repository";

describe("SerpapiRepository.listRecords", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("filters by runId + status for items and total", async () => {
    const items = [{ id: "record-a" }];
    const total = [{ count: 1 }];
    const itemsBuilder = createBuilder(items);
    const totalBuilder = createBuilder(total);

    selectMock
      .mockImplementationOnce(() => itemsBuilder)
      .mockImplementationOnce(() => totalBuilder);

    const repo = new SerpapiRepository();
    const result = await repo.listRecords("run-a", {
      status: "conflict",
      limit: 5,
      offset: 0,
    });

    expect(result.items).toEqual(items);
    expect(result.total).toBe(1);
    expect(itemsBuilder.where).toHaveBeenCalledTimes(1);
    expect(totalBuilder.where).toHaveBeenCalledTimes(1);
    expect(itemsBuilder.where.mock.calls[0][0]).toBe(totalBuilder.where.mock.calls[0][0]);
  });
});
