const notFound = () => new Response("Not Found", { status: 404 });

export class ProductRouter {
  constructor(registry, context = {}) {
    this.registry = registry;
    this.context = context;
  }

  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const product = this.registry.getByRoute(pathname);

    if (!product) {
      return notFound();
    }

    const handler = this.registry.getHandlerById(product.id);

    if (typeof handler !== "function") {
      return notFound();
    }

    return handler(request, product, this.context);
  }
}

export function createRouter(registry) {
  return new ProductRouter(registry);
}