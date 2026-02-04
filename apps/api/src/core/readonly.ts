import { ENV } from "../config/env";
import { AppError } from "./errors";

export function assertWritable(): void {
  if (ENV.BUSCAI_READONLY) {
    throw new AppError(503, "Sistema em modo somente leitura para manutenção");
  }
}
