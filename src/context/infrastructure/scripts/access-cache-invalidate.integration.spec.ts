import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import Redis from "ioredis";

import { AccessCacheFixture } from "~testing/integration/scripts/access-cache.fixture";
import { RedisResource } from "~testing/integration/containers/redis.resource";
import { RedisConfig } from "~infrastructure/redis/redis.config";

describe("[Lua] - access-cache-invalidate", () => {
    let redis: Redis;
    let fixture: AccessCacheFixture;

    beforeAll(async () => {
        redis = new Redis(RedisConfig.buildCacheOptions(RedisResource.config()));
        await redis.connect();
        fixture = new AccessCacheFixture(redis);
        await fixture.load();
    });

    beforeEach(async () => {
        await redis.flushdb();
    });

    afterAll(async () => {
        await redis?.quit();
    });

    describe("[Script] - invalidate", () => {
        it("[case] - leaves Redis unchanged for an empty invalidation", async () => {
            // Act
            await fixture.invalidate({ fields: [], offset: "10" });

            // Assert
            expect(await redis.exists(fixture.keys[3])).toBe(0);
        });

        it("[case] - advances a decimal boundary and skips replayed writes", async () => {
            // Arrange
            await fixture.invalidate({ fields: ["*"], offset: "9" });
            await fixture.invalidate({ fields: ["*"], offset: "10" });
            const before = await fixture.commands();

            // Act
            await fixture.invalidate({ fields: ["*"], offset: "10" });
            await fixture.invalidate({ fields: ["*"], offset: "9" });
            const after = await fixture.commands();

            // Assert
            expect(await fixture.revision("*")).toEqual({ "0": "10" });
            expect((after.hset ?? 0) - (before.hset ?? 0)).toBe(0);
        });

        it("[case] - preserves monotonic offsets and independent partitions beyond numeric precision", async () => {
            // Arrange
            await fixture.invalidate({ fields: ["*", fixture.account], offset: "9007199254740993" });

            // Act
            await fixture.invalidate({ fields: ["*", fixture.account], offset: "9007199254740992" });
            await fixture.invalidate({ fields: ["*", fixture.account], offset: "9007199254740993" });
            await fixture.invalidate({ fields: ["*", fixture.account], offset: "10", partition: "1" });

            // Assert
            expect(await fixture.revision("*")).toEqual({ "0": "9007199254740993", "1": "10" });
            expect(await fixture.revision(fixture.account)).toEqual({ "0": "9007199254740993", "1": "10" });
        });

        it("[case] - updates more than one batch of accounts in a single realm", async () => {
            // Arrange
            const fields: string[] = [];
            for (let index = 0; index < 240; index += 1) {
                fields.push(`account-${index}`);
            }

            // Act
            await fixture.invalidate({ fields, offset: "100" });

            // Assert
            expect(await redis.hlen(fixture.keys[3])).toBe(240);
            expect(await fixture.revision(fields[0])).toEqual({ "0": "100" });
            expect(await fixture.revision(fields[239])).toEqual({ "0": "100" });
        });
    });
});
