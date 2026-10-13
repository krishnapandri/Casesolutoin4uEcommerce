import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  collectionsTable,
  homeContentTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  productCollectionsTable,
} from "@workspace/db";
import {
  CreateAdminOrderBody,
  CreateAdminOrderResponse,
  CreateCollectionBody,
  CreateCollectionResponse,
  CreateProductBody,
  CreateProductResponse,
  DeleteCollectionParams,
  DeleteProductParams,
  GetAdminHomeContentResponse,
  GetAdminSummaryResponse,
  ListAdminCollectionsResponse,
  ListAdminProductsResponse,
  ListAdminOrdersResponse,
  UpdateCollectionBody,
  UpdateCollectionParams,
  UpdateCollectionResponse,
  UpdateHomeContentBody,
  UpdateHomeContentResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import requireStoreAdmin from "../middlewares/requireStoreAdmin";
import { loadProductCollections } from "../lib/store-products";

const router: IRouter = Router();
const adminRouter: IRouter = Router();

class StoreRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

adminRouter.use(requireStoreAdmin);

async function serializeAdminProducts(products: (typeof productsTable.$inferSelect)[]) {
  const collectionRefs = await loadProductCollections(
    products.map((product) => product.id),
    false,
  );
  return products.map((product) => ({
    ...product,
    inStock: product.stockQuantity > 0,
    collections: collectionRefs.get(product.id) ?? [],
  }));
}

async function serializeCollections(publishedOnly: boolean) {
  const collections = await db
    .select()
    .from(collectionsTable)
    .orderBy(collectionsTable.name);
  const ids = collections.map((collection) => collection.id);
  const counts = ids.length
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
            inArray(productCollectionsTable.collectionId, ids),
            publishedOnly ? eq(productsTable.published, true) : undefined,
          ),
        )
        .groupBy(productCollectionsTable.collectionId)
    : [];
  const countById = new Map(
    counts.map((entry) => [entry.collectionId, entry.productCount]),
  );
  return collections.map((collection) => ({
    ...collection,
    productCount: countById.get(collection.id) ?? 0,
  }));
}

function uniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

adminRouter.get("/summary", async (_req, res): Promise<void> => {
  const [productCount, lowStockCount, orderCount, openOrderCount] =
    await Promise.all([
      db.select({ value: count() }).from(productsTable),
      db
        .select({ value: count() })
        .from(productsTable)
        .where(lte(productsTable.stockQuantity, 3)),
      db.select({ value: count() }).from(ordersTable),
      db
        .select({ value: count() })
        .from(ordersTable)
        .where(inArray(ordersTable.status, ["pending", "processing", "shipped"])),
    ]);
  res.json(
    GetAdminSummaryResponse.parse({
      productCount: productCount[0]?.value ?? 0,
      lowStockCount: lowStockCount[0]?.value ?? 0,
      orderCount: orderCount[0]?.value ?? 0,
      openOrderCount: openOrderCount[0]?.value ?? 0,
    }),
  );
});

adminRouter.get("/products", async (_req, res): Promise<void> => {
  const products = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.updatedAt));
  res.json(
    ListAdminProductsResponse.parse(await serializeAdminProducts(products)),
  );
});

adminRouter.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { collectionIds, ...productInput } = parsed.data;
  const existingCollections =
    collectionIds.length === 0
      ? []
      : await db
          .select({ id: collectionsTable.id })
          .from(collectionsTable)
          .where(inArray(collectionsTable.id, collectionIds));
  if (existingCollections.length !== new Set(collectionIds).size) {
    res.status(400).json({ error: "One or more selected collections do not exist." });
    return;
  }

  try {
    const [product] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productsTable)
        .values(productInput)
        .returning();
      if (collectionIds.length) {
        await tx.insert(productCollectionsTable).values(
          collectionIds.map((collectionId) => ({
            productId: created.id,
            collectionId,
          })),
        );
      }
      return [created];
    });
    const [result] = await serializeAdminProducts([product]);
    res.status(201).json(CreateProductResponse.parse(result));
  } catch (error) {
    if (uniqueViolation(error)) {
      res.status(409).json({ error: "A product already uses that URL slug." });
      return;
    }
    throw error;
  }
});

adminRouter.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [product] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const { collectionIds, ...productUpdate } = parsed.data;
  if (collectionIds !== undefined) {
    const existingCollections =
      collectionIds.length === 0
        ? []
        : await db
            .select({ id: collectionsTable.id })
            .from(collectionsTable)
            .where(inArray(collectionsTable.id, collectionIds));
    if (existingCollections.length !== new Set(collectionIds).size) {
      res.status(400).json({ error: "One or more selected collections do not exist." });
      return;
    }
  }

  try {
    const updated = await db.transaction(async (tx) => {
      const [result] = await tx
        .update(productsTable)
        .set(productUpdate)
        .where(eq(productsTable.id, params.data.id))
        .returning();
      if (collectionIds !== undefined) {
        await tx
          .delete(productCollectionsTable)
          .where(eq(productCollectionsTable.productId, params.data.id));
        if (collectionIds.length) {
          await tx.insert(productCollectionsTable).values(
            collectionIds.map((collectionId) => ({
              productId: params.data.id,
              collectionId,
            })),
          );
        }
      }
      return result;
    });
    if (!updated) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    const [result] = await serializeAdminProducts([updated]);
    res.json(UpdateProductResponse.parse(result));
  } catch (error) {
    if (uniqueViolation(error)) {
      res.status(409).json({ error: "A product already uses that URL slug." });
      return;
    }
    throw error;
  }
});

adminRouter.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning({ id: productsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.sendStatus(204);
});

adminRouter.get("/collections", async (_req, res): Promise<void> => {
  res.json(
    ListAdminCollectionsResponse.parse(await serializeCollections(false)),
  );
});

adminRouter.post("/collections", async (req, res): Promise<void> => {
  const parsed = CreateCollectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [collection] = await db
      .insert(collectionsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(
      CreateCollectionResponse.parse({ ...collection, productCount: 0 }),
    );
  } catch (error) {
    if (uniqueViolation(error)) {
      res.status(409).json({ error: "A collection already uses that URL slug." });
      return;
    }
    throw error;
  }
});

adminRouter.patch("/collections/:id", async (req, res): Promise<void> => {
  const params = UpdateCollectionParams.safeParse(req.params);
  const parsed = UpdateCollectionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [collection] = await db
      .update(collectionsTable)
      .set(parsed.data)
      .where(eq(collectionsTable.id, params.data.id))
      .returning();
    if (!collection) {
      res.status(404).json({ error: "Collection not found." });
      return;
    }
    const [result] = await serializeCollections(false).then((rows) =>
      rows.filter((row) => row.id === collection.id),
    );
    res.json(UpdateCollectionResponse.parse(result));
  } catch (error) {
    if (uniqueViolation(error)) {
      res.status(409).json({ error: "A collection already uses that URL slug." });
      return;
    }
    throw error;
  }
});

adminRouter.delete("/collections/:id", async (req, res): Promise<void> => {
  const params = DeleteCollectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(collectionsTable)
    .where(eq(collectionsTable.id, params.data.id))
    .returning({ id: collectionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Collection not found." });
    return;
  }
  res.sendStatus(204);
});

adminRouter.get("/home-content", async (_req, res): Promise<void> => {
  const [content] = await db.select().from(homeContentTable).limit(1);
  res.json(
    GetAdminHomeContentResponse.parse({
      announcement: content?.announcement ?? null,
      shippingPolicy: content?.shippingPolicy ?? null,
      returnsPolicy: content?.returnsPolicy ?? null,
      supportEmail: content?.supportEmail ?? null,
      trustItems: content?.trustItems ?? [],
    }),
  );
});

adminRouter.put("/home-content", async (req, res): Promise<void> => {
  const parsed = UpdateHomeContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [content] = await db
    .insert(homeContentTable)
    .values({ id: 1, ...parsed.data })
    .onConflictDoUpdate({
      target: homeContentTable.id,
      set: parsed.data,
    })
    .returning();
  res.json(
    UpdateHomeContentResponse.parse({
      announcement: content.announcement,
      shippingPolicy: content.shippingPolicy,
      returnsPolicy: content.returnsPolicy,
      supportEmail: content.supportEmail,
      trustItems: content.trustItems,
    }),
  );
});

async function serializeOrders() {
  const orders = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt));
  const itemCounts = orders.length
    ? await db
        .select({
          orderId: orderItemsTable.orderId,
          quantity: orderItemsTable.quantity,
        })
        .from(orderItemsTable)
        .where(inArray(orderItemsTable.orderId, orders.map((order) => order.id)))
    : [];
  const quantityByOrder = new Map<string, number>();
  for (const item of itemCounts) {
    quantityByOrder.set(
      item.orderId,
      (quantityByOrder.get(item.orderId) ?? 0) + item.quantity,
    );
  }
  return orders.map((order) => ({
    ...order,
    itemCount: quantityByOrder.get(order.id) ?? 0,
  }));
}

adminRouter.get("/orders", async (_req, res): Promise<void> => {
  res.json(ListAdminOrdersResponse.parse(await serializeOrders()));
});

adminRouter.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateAdminOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) {
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + item.quantity,
    );
  }

  try {
    const order = await db.transaction(async (tx) => {
      const itemSnapshots: {
        productId: string;
        productName: string;
        unitPricePaise: number;
        quantity: number;
      }[] = [];
      let amountPaise = 0;

      for (const [productId, quantity] of quantities) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, productId))
          .limit(1);
        if (!product) {
          throw new StoreRouteError("One or more products were not found.", 400);
        }
        const [reserved] = await tx
          .update(productsTable)
          .set({
            stockQuantity: sql`${productsTable.stockQuantity} - ${quantity}`,
          })
          .where(
            and(
              eq(productsTable.id, productId),
              gte(productsTable.stockQuantity, quantity),
            ),
          )
          .returning({ id: productsTable.id });
        if (!reserved) {
          throw new StoreRouteError(
            `Not enough stock for ${product.name}.`,
            409,
          );
        }
        amountPaise += product.pricePaise * quantity;
        itemSnapshots.push({
          productId,
          productName: product.name,
          unitPricePaise: product.pricePaise,
          quantity,
        });
      }

      const [created] = await tx
        .insert(ordersTable)
        .values({
          orderNumber: `CSU-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          customerName: parsed.data.customerName,
          customerEmail: parsed.data.customerEmail.trim().toLowerCase(),
          customerPhone: parsed.data.customerPhone,
          shippingAddress: parsed.data.shippingAddress,
          amountPaise,
        })
        .returning();
      await tx.insert(orderItemsTable).values(
        itemSnapshots.map((item) => ({ ...item, orderId: created.id })),
      );
      return { ...created, itemCount: itemSnapshots.reduce((sum, item) => sum + item.quantity, 0) };
    });
    res.status(201).json(CreateAdminOrderResponse.parse(order));
  } catch (error) {
    if (error instanceof StoreRouteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

adminRouter.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.id))
        .limit(1);
      if (!current) {
        throw new StoreRouteError("Order not found.", 404);
      }
      if (current.status === "cancelled" && parsed.data.status !== "cancelled") {
        throw new StoreRouteError(
          "A cancelled order cannot be reopened. Record a new order instead.",
          400,
        );
      }
      if (current.status !== "cancelled" && parsed.data.status === "cancelled") {
        const items = await tx
          .select({
            productId: orderItemsTable.productId,
            quantity: orderItemsTable.quantity,
          })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, current.id));
        for (const item of items) {
          if (item.productId) {
            await tx
              .update(productsTable)
              .set({
                stockQuantity: sql`${productsTable.stockQuantity} + ${item.quantity}`,
              })
              .where(eq(productsTable.id, item.productId));
          }
        }
      }
      const [saved] = await tx
        .update(ordersTable)
        .set({ status: parsed.data.status })
        .where(eq(ordersTable.id, current.id))
        .returning();
      const [quantity] = await tx
        .select({ value: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)` })
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, saved.id));
      return { ...saved, itemCount: Number(quantity?.value ?? 0) };
    });
    res.json(UpdateOrderResponse.parse(updated));
  } catch (error) {
    if (error instanceof StoreRouteError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.use("/admin", adminRouter);

export default router;
