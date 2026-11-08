import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import { PermissionCode, PrivilegeScope } from "@monadiam/shared";
import Redis from "ioredis";

import { AccessCacheFixture } from "~testing/integration/scripts/access-cache.fixture";
import { RedisResource } from "~testing/integration/containers/redis.resource";
import { RedisConfig } from "~infrastructure/redis/redis.config";

describe("[Lua] - access-cache-read", () => {
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

    describe("[Script] - read", () => {
        it("[case] - reports missing global metadata even when the realm snapshot exists", async () => {
            // Arrange
            await fixture.write({ snapshot });
            await redis.del(fixture.keys[0]);

            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result.loaded).toBe(false);
        });

        it("[case] - reports a realm without its global dependency as unloaded", async () => {
            // Arrange
            await fixture.write({ snapshot });
            await redis.hdel(fixture.keys[1], "_globalRevision");

            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result.loaded).toBe(false);
        });

        it.each(["*", "account-a"])("[case] - detects a newer global revision for %s", async (field) => {
            // Arrange
            await fixture.write({ snapshot, globalOnly: true });
            await fixture.invalidate({ fields: [field], offset: "21", partition: "1", global: true });

            // Act
            const result = await fixture.read({ permissions, globalOnly: true });

            // Assert
            expect(result).toEqual({ loaded: true, stale: true, matched: snapshot.global });
        });

        it.each([1, 2, 3])("[case] - reads %s requested permissions with realm precedence", async (count) => {
            // Arrange
            await fixture.write({ snapshot });
            const before = await fixture.commands();

            // Act
            const result = await fixture.read({ permissions: permissions.slice(0, count) });
            const after = await fixture.commands();

            // Assert
            expect((after.hmget ?? 0) - (before.hmget ?? 0)).toBe(4);
            expect((after.hget ?? 0) - (before.hget ?? 0)).toBe(0);
            expect((after.hgetall ?? 0) - (before.hgetall ?? 0)).toBe(0);
            expect(result).toEqual({
                loaded: true,
                stale: false,
                matched:
                    count === 1
                        ? { [permissions[0]]: PrivilegeScope.GLOBAL }
                        : { [permissions[0]]: PrivilegeScope.GLOBAL, [permissions[1]]: PrivilegeScope.REALM },
            });
        });

        it("[case] - reports an absent snapshot as unloaded", async () => {
            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result).toEqual({ loaded: false, stale: false, matched: {} });
        });

        it("[case] - reads only global permissions without a realm snapshot", async () => {
            // Arrange
            await fixture.write({ snapshot, globalOnly: true });

            // Act
            const result = await fixture.read({ permissions, globalOnly: true });

            // Assert
            expect(result).toEqual({ loaded: true, stale: false, matched: snapshot.global });
            expect(await redis.exists(fixture.keys[1])).toBe(0);
        });

        it("[case] - retains an empty snapshot as a cached denial", async () => {
            // Arrange
            snapshot.global = {};
            snapshot.privileges = {};
            await fixture.write({ snapshot });

            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result).toEqual({ loaded: true, stale: false, matched: {} });
        });

        it.each(["*", "account-a"])(
            "[case] - marks stale after invalidation of %s without losing cached rights",
            async (field) => {
                // Arrange
                await fixture.write({ snapshot });
                await fixture.invalidate({ fields: [field], offset: "11" });

                // Act
                const result = await fixture.read({ permissions });

                // Assert
                expect(result).toEqual({
                    loaded: true,
                    stale: true,
                    matched: {
                        [permissions[0]]: PrivilegeScope.GLOBAL,
                        [permissions[1]]: PrivilegeScope.REALM,
                    },
                });
            },
        );

        it("[case] - does not invalidate an unrelated account", async () => {
            // Arrange
            await fixture.write({ snapshot });
            await fixture.invalidate({ fields: ["account-b"], offset: "99" });

            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result.stale).toBe(false);
        });

        it("[case] - keeps an older realm stale after another realm refreshes the shared global snapshot", async () => {
            // Arrange
            await fixture.write({ snapshot });
            await fixture.invalidate({ fields: ["*"], offset: "21", partition: "1", global: true });
            const keys: Fixtures.AccessCache.Keys = [...fixture.keys];
            keys[1] = "access-cache:v3:0:account-a:other:realm";
            keys[3] = "access-cache:v3:required:other";
            await fixture.write({ snapshot: { ...snapshot, globalRevision: { "1": "21" } }, keys });

            // Act
            const result = await fixture.read({ permissions });
            const refreshed = await fixture.read({ permissions, keys });

            // Assert
            expect(result.stale).toBe(true);
            expect(refreshed.stale).toBe(false);
        });

        it("[case] - treats an expired snapshot as missing", async () => {
            // Arrange
            await fixture.write({ snapshot });
            await redis.pexpire(fixture.keys[1], 0);

            // Act
            const result = await fixture.read({ permissions });

            // Assert
            expect(result.loaded).toBe(false);
        });
    });
});
