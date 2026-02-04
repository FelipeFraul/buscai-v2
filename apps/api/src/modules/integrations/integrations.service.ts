import { IntegrationsRepository } from "./integrations.repository";

export class IntegrationsService {
  constructor(private readonly _integrationsRepository: IntegrationsRepository) {}

  async placeholder(): Promise<void> {
    throw new Error("Not implemented");
  }
}
