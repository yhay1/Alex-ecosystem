const notFound = () => new Response("Not Found", { status: 404 });

export class ProductRouter {
  constructor(registry, context = {}) {
    this.registry = registry;
    this.context = context;
  }

  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const product = this.registry
      .list()
      .filter(({ route }) => pathname === route || pathname.startsWith(`${route}/`))
      .sort((left, right) => right.route.length - left.route.length)[0];

    if (!product) {
      return notFound();
    }

    const handler = this.registry.getHandlerById(product.id);

    if (typeof handler !== "function") {
      return notFound();
    }

    const subPath = pathname.slice(product.route.length) || "/";
    return handler(request, product, {
      ...this.context,
      productId: product.id,
      productRoute: product.route,
      subPath,
      manifest: product,
    });
  }
}

export function createRouter(registry, context = {}) {
  return new ProductRouter(registry, context);
}