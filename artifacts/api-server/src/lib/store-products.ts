import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  collectionsTable,
  productCollectionsTable,
} from "@workspace/db";

export type CollectionReference = {
  id: string;
  name: string;
  slug: string;
};

export async function loadProductCollections(
  productIds: string[],
  publishedOnly: boolean,
): Promise<Map<string, CollectionReference[]>> {
  const grouped = new Map<string, CollectionReference[]>();
  if (productIds.length === 0) return grouped;

  const rows = await db
    .select({
      productId: productCollectionsTable.productId,
      id: collectionsTable.id,
      name: collectionsTable.name,
      slug: collectionsTable.slug,
    })
    .from(productCollectionsTable)
    .innerJoin(
      collectionsTable,
      eq(productCollectionsTable.collectionId, collectionsTable.id),
    )
    .where(
      and(
        inArray(productCollectionsTable.productId, productIds),
        publishedOnly ? eq(collectionsTable.published, true) : undefined,
      ),
    );

  for (const row of rows) {
    const refs = grouped.get(row.productId) ?? [];
    refs.push({ id: row.id, name: row.name, slug: row.slug });
    grouped.set(row.productId, refs);
  }
  return grouped;
}
