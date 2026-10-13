import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  collectionsTable,
  homeContentTable,
  newsletterSubscribersTable,
  productsTable,
  productCollectionsTable,
} from "@workspace/db";
import {
  GetHomeContentResponse,
  GetProductParams,
  GetProductResponse,
  ListCollectionsResponse,
  ListDevicesResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  SubscribeNewsletterBody,
  SubscribeNewsletterResponse,
} from "@workspace/api-zod";
import { loadProductCollections } from "../lib/store-products";

const router: IRouter = Router();

router.get("/home-content", async (_req, res): Promise<void> => {
  const [content] = await db.select().from(homeContentTable).limit(1);
  res.json(
    GetHomeContentResponse.parse({
      announcement: content?.announcement ?? null,
      shippingPolicy: content?.shippingPolicy ?? null,
      returnsPolicy: content?.returnsPolicy ?? null,
      supportEmail: content?.supportEmail ?? null,
      trustItems: content?.trustItems ?? [],
    }),
  );
});

router.get("/collections", async (_req, res): Promise<void> => {
  const collections = await db
    .select()
    .from(collectionsTable)
    .where(eq(collectionsTable.published, true))
    .orderBy(collectionsTable.name);
  const collectionIds = collections.map((collection) => collection.id);
  const counts = collectionIds.length
    ? await db
        .select({
          collectionId: productCollectionsTable.collectionId,
          productCount: count(),
        })
        .from(productCollectionsTable)
        .innerJoin(
          productsTable,
          eq(productCollectionsTable.productId, productsTable.id),
        )
        .where(
          and(
            inArray(productCollectionsTable.collectionId, collectionIds),
            eq(productsTable.published, true),
          ),
        )
        .groupBy(productCollectionsTable.collectionId)
    : [];
  const countById = new Map(
    counts.map((entry) => [entry.collectionId, entry.productCount]),
  );
  res.json(
    ListCollectionsResponse.parse(
      collections.map((collection) => ({
        ...collection,
        productCount: countById.get(collection.id) ?? 0,
      })),
    ),
  );
});

router.get("/devices", async (_req, res): Promise<void> => {
  const products = await db
    .select({ compatibility: productsTable.compatibility })
    .from(productsTable)
    .where(eq(productsTable.published, true));
  const modelCounts = new Map<string, { brand: string; model: string; count: number }>();

  for (const product of products) {
    for (const compatible of product.compatibility) {
      const [brand = "", ...modelParts] = compatible.trim().split(/\s+/);
      const model = modelParts.join(" ") || brand;
      const key = `${brand.toLowerCase()}|${model.toLowerCase()}`;
      const existing = modelCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        modelCounts.set(key, { brand, model, count: 1 });
      }
    }
  }

  res.json(
    ListDevicesResponse.parse(
      [...modelCounts.values()]
        .map(({ brand, model, count: productCount }) => ({
          brand,
          model,
          productCount,
        }))
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model)),
    ),
  );
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = parsed.data;
  const conditions = [eq(productsTable.published, true)];
  if (filters.q?.trim()) {
    const term = `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(productsTable.name, term),
        ilike(productsTable.description, term),
        ilike(productsTable.category, term),
      )!,
    );
  }
  if (filters.brand?.trim()) {
    conditions.push(
      sql`array_to_string(${productsTable.compatibility}, ' ') ILIKE ${`%${filters.brand.trim()}%`}`,
    );
  }
  if (filters.model?.trim()) {
    conditions.push(
      sql`array_to_string(${productsTable.compatibility}, ' ') ILIKE ${`%${filters.model.trim()}%`}`,
    );
  }
  if (filters.featured !== undefined) {
    conditions.push(eq(productsTable.featured, filters.featured));
  }
  if (filters.collection?.trim()) {
    conditions.push(
      inArray(
        productsTable.id,
        db
          .select({ productId: productCollectionsTable.productId })
          .from(productCollectionsTable)
          .innerJoin(
            collectionsTable,
            eq(productCollectionsTable.collectionId, collectionsTable.id),
          )
          .where(
            and(
              eq(collectionsTable.slug, filters.collection.trim()),
              eq(collectionsTable.published, true),
            ),
          ),
      ),
    );
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(desc(productsTable.featured), desc(productsTable.createdAt))
    .limit(filters.limit ?? 60);
  const collectionRefs = await loadProductCollections(
    products.map((product) => product.id),
    true,
  );
  res.json(
    ListProductsResponse.parse(
      products.map((product) => ({
        ...product,
        inStock: product.stockQuantity > 0,
        collections: collectionRefs.get(product.id) ?? [],
      })),
    ),
  );
});

router.get("/products/:slug", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.slug, params.data.slug),
        eq(productsTable.published, true),
      ),
    )
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const collectionRefs = await loadProductCollections([product.id], true);
  res.json(
    GetProductResponse.parse({
      ...product,
      inStock: product.stockQuantity > 0,
      collections: collectionRefs.get(product.id) ?? [],
    }),
  );
});

router.post("/newsletter", async (req, res): Promise<void> => {
  const parsed = SubscribeNewsletterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db
    .insert(newsletterSubscribersTable)
    .values({ email: parsed.data.email.trim().toLowerCase() })
    .onConflictDoNothing();
  res.status(201).json(
    SubscribeNewsletterResponse.parse({
      subscribed: true,
      message: "Thanks for signing up.",
    }),
  );
});

export default router;
