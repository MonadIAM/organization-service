import { PermissionCode, PrivilegeScope, SYSTEM_REALM_ID } from "@monadiam/shared";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import ms, { StringValue } from "ms";
import Redis from "ioredis";

import { REDIS_CACHE_CLIENT } from "~infrastructure/redis";
import { AccessControlClient } from "~infrastructure/grpc";

@Injectable()
export class AccessCacheService implements InfrastructureServices.AccessCache.Contract {
    private readonly ttl: number;
    private readonly namespace = "access-cache:v2";

    public constructor(
        @Inject(REDIS_CACHE_CLIENT)
        private readonly redis: Redis,
        private readonly configService: ConfigService,
        private readonly accessControlClient: AccessControlClient,
    ) {
        this.ttl = ms(this.configService.getOrThrow<StringValue>("ACCESS_CACHE_TTL")) / 1e3;
    }

    public async checkPermissions(
        props: InfrastructureServices.AccessCache.CheckPermissions.Props,
    ): InfrastructureServices.AccessCache.CheckPermissions.Result {
        const { account, realm, permissions, globalOnly } = props;
        if (!permissions.length) {
            return {};
        }

        const keys = await this.resolveVersionedKeys({ account, realm });
        const pipeline = this.redis.pipeline();
        pipeline.exists(`${keys.global}:loaded`);
        pipeline.hmget(keys.global, ...permissions);

        if (!globalOnly) {
            pipeline.exists(`${keys.realm}:loaded`);
            pipeline.hmget(keys.realm, ...permissions);
        }

        const results = await pipeline.exec();
        for (const [error] of results ?? []) {
            if (error) {
                throw error;
            }
        }

        const globalLoaded = results?.[0]?.[1] === 1;
        const realmLoaded = results?.[2]?.[1] === 1;
        const matched: Partial<Record<PermissionCode, PrivilegeScope>> = {};

        if (globalLoaded && (globalOnly || realmLoaded)) {
            const global = results?.[1]?.[1] as Nullable<string>[];
            const local = results?.[3]?.[1] as Nullable<string>[];

            for (const [index, permission] of permissions.entries()) {
                if (!globalOnly && local[index] === PrivilegeScope.REALM) {
                    matched[permission] = PrivilegeScope.REALM;
                } else if (global[index] === PrivilegeScope.GLOBAL) {
                    matched[permission] = PrivilegeScope.GLOBAL;
                }
            }
        } else {
            const snapshot = await this.loadPermissions({ account, realm, globalOnly, keys, globalLoaded, realmLoaded });

            for (const permission of permissions) {
                if (!globalOnly && snapshot.privileges[permission] === PrivilegeScope.REALM) {
                    matched[permission] = PrivilegeScope.REALM;
                } else if (snapshot.global[permission] === PrivilegeScope.GLOBAL) {
                    matched[permission] = PrivilegeScope.GLOBAL;
                }
            }
        }

        return matched;
    }

    public async delete(
        props: InfrastructureServices.AccessCache.Delete.Props,
    ): InfrastructureServices.AccessCache.Delete.Result {
        const { account, realm } = props;
        await this.redis.incr(`${this.namespace}:account-realm-version:${account}:${realm}`);
    }

    public async deleteAccount(
        props: InfrastructureServices.AccessCache.DeleteAccount.Props,
    ): InfrastructureServices.AccessCache.DeleteAccount.Result {
        const { account } = props;
        await this.redis.incr(`${this.namespace}:account-version:${account}`);
    }

    public async deleteRealm(
        props: InfrastructureServices.AccessCache.DeleteRealm.Props,
    ): InfrastructureServices.AccessCache.DeleteRealm.Result {
        const { realm } = props;
        await this.redis.incr(`${this.namespace}:realm-version:${realm}`);
    }

    public async deleteAll(): InfrastructureServices.AccessCache.DeleteAll.Result {
        await this.redis.incr(`${this.namespace}:global-version`);
    }

    public async loadPermissions(
        props: InfrastructureServices.AccessCache.LoadPermissions.Props,
    ): InfrastructureServices.AccessCache.LoadPermissions.Result {
        const { account, realm, globalOnly, keys, globalLoaded, realmLoaded } = props;
        const snapshot = await this.accessControlClient.listEffectivePrivileges({
            realm: globalOnly ? SYSTEM_REALM_ID : realm,
            account,
        });

        const transaction = this.redis.multi();

        if (!globalLoaded) {
            transaction.del(keys.global, `${keys.global}:loaded`);
            if (Object.keys(snapshot.global).length) {
                transaction.hset(keys.global, snapshot.global);
                transaction.expire(keys.global, this.ttl);
            }
            transaction.set(`${keys.global}:loaded`, "1", "EX", this.ttl);
        }

        if (!globalOnly && !realmLoaded) {
            transaction.del(keys.realm, `${keys.realm}:loaded`);
            if (Object.keys(snapshot.privileges).length) {
                transaction.hset(keys.realm, snapshot.privileges);
                transaction.expire(keys.realm, this.ttl);
            }
            transaction.set(`${keys.realm}:loaded`, "1", "EX", this.ttl);
        }

        const written = await transaction.exec();
        for (const [error] of written ?? []) {
            if (error) {
                throw error;
            }
        }

        return snapshot;
    }

    public async resolveVersionedKeys(
        props: InfrastructureServices.AccessCache.ResolveVersionedKeys.Props,
    ): InfrastructureServices.AccessCache.ResolveVersionedKeys.Result {
        const { account, realm } = props;
        const globalVersionKey = `${this.namespace}:global-version`;
        const accountVersionKey = `${this.namespace}:account-version:${account}`;
        const realmVersionKey = `${this.namespace}:realm-version:${realm}`;

        const systemVersionKey = `${this.namespace}:realm-version:${SYSTEM_REALM_ID}`;
        const accountRealmVersionKey = `${this.namespace}:account-realm-version:${account}:${realm}`;
        const accountSystemVersionKey = `${this.namespace}:account-realm-version:${account}:${SYSTEM_REALM_ID}`;
        const versions = await this.redis.mget(
            globalVersionKey,
            accountVersionKey,
            realmVersionKey,
            systemVersionKey,
            accountRealmVersionKey,
            accountSystemVersionKey,
        );
        const [globalVersion, accountVersion, realmVersion, systemVersion, accountRealmVersion, accountSystemVersion] =
            versions.map((version) => version ?? "0");
        const prefix = `${this.namespace}:${globalVersion}:${account}:${accountVersion}`;

        return {
            realm: `${prefix}:${realm}:${realmVersion}:${accountRealmVersion}`,
            global: `${prefix}:${SYSTEM_REALM_ID}:${systemVersion}:${accountSystemVersion}:global`,
        };
    }
}
