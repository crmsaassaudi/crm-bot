import redis from "@typebot.io/lib/redis";

/** TTL for flow resolution cache (seconds). Short enough to pick up changes quickly. */
const FLOW_CACHE_TTL = 60;

/** TTL for tenant→workspace mapping cache (seconds). Mappings change very rarely. */
const TENANT_MAPPING_CACHE_TTL = 300;

type CachedFlow = {
  publicId: string;
  typebotId: string;
  name: string;
} | null;

type CachedTenantMapping = {
  id: string;
  tenantId: string;
  workspaceId: string;
  ownerEmail: string;
} | null;

// ── Flow Resolution Cache ──────────────────────────────────────────────

const flowCacheKey = (tenantId: string, channelId?: string): string =>
  `crm-bot:flow_resolve:${tenantId}:${channelId ?? "_default"}`;

/** Index Set that tracks which channelIds have cached flow entries for a tenant. */
const flowIndexKey = (tenantId: string): string =>
  `crm-bot:flow_resolve_idx:${tenantId}`;

export const getCachedFlow = async (
  tenantId: string,
  channelId?: string,
): Promise<{ hit: true; flow: CachedFlow } | { hit: false }> => {
  if (!redis) return { hit: false };

  try {
    const raw = await redis.get(flowCacheKey(tenantId, channelId));
    if (raw === null) return { hit: false };

    // Distinguish "no flow found" (cached as "__null__") from "flow found"
    if (raw === "__null__") return { hit: true, flow: null };

    return { hit: true, flow: JSON.parse(raw) };
  } catch {
    return { hit: false };
  }
};

export const setCachedFlow = async (
  tenantId: string,
  channelId: string | undefined,
  flow: CachedFlow,
): Promise<void> => {
  if (!redis) return;

  try {
    const key = flowCacheKey(tenantId, channelId);
    const value = flow === null ? "__null__" : JSON.stringify(flow);

    // Use pipeline to set the cache and track the key in one roundtrip
    await redis
      .multi()
      .set(key, value, "EX", FLOW_CACHE_TTL)
      // Track this channel in a per-tenant index set for O(1) invalidation
      .sadd(flowIndexKey(tenantId), channelId ?? "_default")
      .expire(flowIndexKey(tenantId), FLOW_CACHE_TTL + 10)
      .exec();
  } catch {
    // Cache write failure is non-critical
  }
};

/**
 * Invalidates flow cache for a tenant.
 *
 * Uses a per-tenant index Set to enumerate which channel keys exist,
 * then deletes them deterministically. This avoids SCAN which is O(N)
 * over the entire Redis keyspace and can block the cluster under load.
 */
export const invalidateFlowCache = async (
  tenantId: string,
  channelId?: string,
): Promise<void> => {
  if (!redis) return;

  try {
    if (channelId) {
      // Invalidate specific channel + remove from index
      await redis
        .multi()
        .del(flowCacheKey(tenantId, channelId))
        .srem(flowIndexKey(tenantId), channelId)
        .exec();
    } else {
      // Invalidate ALL cached flows for this tenant
      // Read the index set to know which keys to delete (O(M), M = channels)
      const members = await redis.smembers(flowIndexKey(tenantId));
      if (members.length > 0) {
        const keys = members.map((ch) => flowCacheKey(tenantId, ch));
        keys.push(flowIndexKey(tenantId));
        await redis.del(...keys);
      } else {
        // Index empty — just delete the default key and index
        await redis.del(
          flowCacheKey(tenantId, undefined),
          flowIndexKey(tenantId),
        );
      }
    }
  } catch {
    // Cache invalidation failure is non-critical
  }
};

// ── Tenant Workspace Mapping Cache ─────────────────────────────────────

const tenantMappingCacheKey = (tenantId: string): string =>
  `crm-bot:tenant_ws:${tenantId}`;

export const getCachedTenantMapping = async (
  tenantId: string,
): Promise<
  { hit: true; mapping: CachedTenantMapping } | { hit: false }
> => {
  if (!redis) return { hit: false };

  try {
    const raw = await redis.get(tenantMappingCacheKey(tenantId));
    if (raw === null) return { hit: false };
    if (raw === "__null__") return { hit: true, mapping: null };

    return { hit: true, mapping: JSON.parse(raw) };
  } catch {
    return { hit: false };
  }
};

export const setCachedTenantMapping = async (
  tenantId: string,
  mapping: CachedTenantMapping,
): Promise<void> => {
  if (!redis) return;

  try {
    const value = mapping === null ? "__null__" : JSON.stringify(mapping);
    await redis.set(
      tenantMappingCacheKey(tenantId),
      value,
      "EX",
      TENANT_MAPPING_CACHE_TTL,
    );
  } catch {
    // Cache write failure is non-critical
  }
};

export const invalidateTenantMappingCache = async (
  tenantId: string,
): Promise<void> => {
  if (!redis) return;

  try {
    await redis.del(tenantMappingCacheKey(tenantId));
  } catch {
    // Cache invalidation failure is non-critical
  }
};
