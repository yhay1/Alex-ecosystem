export class ProductRegistry {
  static fromManifests(products: Array<{ manifest: unknown; handler?: unknown }>): ProductRegistry;
}