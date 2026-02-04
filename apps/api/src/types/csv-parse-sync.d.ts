declare module "csv-parse/sync" {
  import { Options } from "csv-parse";
  export function parse(
    input: string | Buffer,
    options?: Options & { columns?: boolean | string[] }
  ): any;
}
