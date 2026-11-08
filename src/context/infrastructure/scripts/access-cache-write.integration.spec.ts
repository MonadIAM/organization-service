import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import { PermissionCode, PrivilegeScope } from "@monadiam/shared";
import Redis from "ioredis";

import { AccessCacheFixture } from "~testing/integration/scripts/access-cache.fixture";
import { RedisResource } from "~testing/integration/containers/redis.resource";
import { RedisConfig } from "~infrastructure/redis/redis.config";

describe("[Lua] - access-cache-write", () => {
    let redis: Redis;
    let fixture: AccessCacheFixture;
    let snapshot: Fixtures.AccessCache.Snapshot;
    const permissions = Object.values(PermissionCode).slice(0, 3);

    beforeAll(async () => {
        redis = new Redis(RedisConfig.buildCacheOptions(RedisResource.config()));
        await redis.connect();
        fixture = new AccessCacheFixture(redis);
        await fixture.load();
    });

    beforeEach(async () => {
        await redis.flushdb();
        snapshot = {
            revisioned: true,
            global: { [permissions[0]]: PrivilegeScope.GLOBAL, [permissions[1]]: PrivilegeScope.GLOBAL },
            privileges: { [permissions[1]]: PrivilegeScope.REALM },
            revision: { "0": "10" },
            globalRevision: { "1": "20" },
        };
    });

    afterAll(async () => {
        await redis?.quit();
    });

    describe("[Script] - write", () => {
        it.each([false, true])("[case] - rejects a response behind account invalidation, global=%s", async (global) => {
            // Arrange
            await fixture.write({ snapshot });
            await fixture.invalidate({ fields: [fixture.account], offset: "99", partition: global ? "1" : "0", global });
            const before = await redis.hgetall(fixture.keys[0]);
            const beforeRealm = await redis.hgetall(fixture.keys[1]);

            // Act
            const result = await fixture.write({ snapshot });

            // Assert
            expect(result).toBe(0);
            expect(await redis.hgetall(fixture.keys[0])).toEqual(before);
            expect(await redis.hgetall(fixture.keys[1])).toEqual(beforeRealm);
        });

        it("[case] - rejects a global rollback before changing either snapshot", async () => {
            // Arrange
            await fixture.write({ snapshot: { ...snapshot, globalRevision: { "1": "21" }, global: {} } });

            // Act
            const result = await fixture.write({ snapshot });

            // Assert
            expect(result).toBe(0);
            expect(await redis.hget(fixture.keys[0], permissions[0])).toBeNull();
        });

        it.each([0, 62, 63, 64, 65, 400, 4096])(
            "[case] - replaces a snapshot containing %s rights across bounded batches",
            async (count) => {
                // Arrange
                await fixture.write({ snapshot });
                snapshot.privileges = {};
                for (let index = 0; index < count; index += 1) {
                    snapshot.privileges[`permission-${index}`] = PrivilegeScope.REALM;
                }
                snapshot.revision = { "0": "11" };
                const before = await fixture.commands();

                // Act
                const result = await fixture.write({ snapshot, ttl: 30000 });
                const after = await fixture.commands();

                // Assert
                expect(result).toBe(1);
                expect((after.hset ?? 0) - (before.hset ?? 0)).toBe(1 + Math.ceil((count + 2) / 64));
                expect(await redis.hlen(fixture.keys[1])).toBe(count + 2);
                expect(await redis.hget(fixture.keys[1], permissions[1])).toBeNull();
                if (count) {
                    expect(await redis.hget(fixture.keys[1], `permission-${count - 1}`)).toBe(PrivilegeScope.REALM);
                }
                expect(await redis.pttl(fixture.keys[1])).toBeGreaterThan(0);
                expect(await redis.pttl(fixture.keys[1])).toBeLessThanOrEqual(30000);
            },
        );

        it.each([false, true])("[case] - rejects a response behind an invalidation, global=%s", async (global) => {
            // Arrange
            await fixture.write({ snapshot });
            const previous = await redis.hgetall(fixture.keys[1]);
            await fixture.invalidate({ fields: ["*"], offset: "99", partition: global ? "1" : "0", global });

            // Act
            const result = await fixture.write({ snapshot: { ...snapshot, privileges: {} } });

            // Assert
            expect(result).toBe(0);
            expect(await redis.hgetall(fixture.keys[1])).toEqual(previous);
        });

        it("[case] - rejects an older response after a newer response was saved", async () => {
            // Arrange
            await fixture.write({ snapshot: { ...snapshot, revision: { "0": "11" }, privileges: {} } });

            // Act
            const result = await fixture.write({ snapshot });

            // Assert
            expect(result).toBe(0);
            expect(await redis.hget(fixture.keys[1], permissions[1])).toBeNull();
        });

        it("[case] - prevents rollback of a realm global dependency after the shared snapshot expires", async () => {
            // Arrange
            await fixture.write({ snapshot: { ...snapshot, globalRevision: { "1": "21" } } });
            await redis.del(fixture.keys[0]);

            // Act
            const result = await fixture.write({ snapshot });

            // Assert
            expect(result).toBe(0);
            expect(await redis.exists(fixture.keys[0])).toBe(0);
        });

        it("[case] - accepts a refreshed snapshot that covers all required partitions", async () => {
            // Arrange
            await fixture.invalidate({ fields: ["*"], offset: "11" });
            await fixture.invalidate({ fields: [fixture.account], offset: "5", partition: "2" });

            // Act
            const rejected = await fixture.write({ snapshot });
            const accepted = await fixture.write({ snapshot: { ...snapshot, revision: { "0": "11", "2": "5" } } });
            const result = await fixture.read({ permissions });

            // Assert
            expect(rejected).toBe(0);
            expect(accepted).toBe(1);
            expect(result.stale).toBe(false);
        });
    });
});
