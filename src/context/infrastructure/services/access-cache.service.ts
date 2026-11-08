import { SYSTEM_REALM_ID, InvalidationScope } from "@monadiam/shared";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "node:fs/promises";
import { isString } from "class-validator";
import ms, { StringValue } from "ms";
import { join } from "node:path";
import Redis from "ioredis";

import { AccessControlClient } from "~infrastructure/grpc/access-control.client";
import { REDIS_CACHE_CLIENT } from "~infrastructure/redis";
import { Exception } from "~common/exceptions";

@Injectable()
export class AccessCacheService implements InfrastructureServices.AccessCache.Contract {
    private readonly scripts = {
        invalidate: readFile(join(__dirname, "../scripts/access-cache-invalidate.lua"), "utf8"),
        write: readFile(join(__dirname, "../scripts/access-cache-write.lua"), "utf8"),
        read: readFile(join(__dirname, "../scripts/access-cache-read.lua"), "utf8"),
    };
    private readonly hashes = new Map<InfrastructureServices.AccessCache.Script, Promise<string>>();
    private readonly refreshes = new Map<string, Promise<void>>();
    private readonly namespace = "access-cache:v3";
    private readonly ttl: number;

    public constructor(
        @Inject(REDIS_CACHE_CLIENT)
        private readonly redis: Redis,
        private readonly configService: ConfigService,
        private readonly accessControlClient: AccessControlClient,
    ) {
        this.ttl = ms(this.configService.getOrThrow<StringValue>("ACCESS_CACHE_TTL"));
    }

    public async checkPermissions(
        props: InfrastructureServices.AccessCache.CheckPermissions.Props,
    ): InfrastructureServices.AccessCache.CheckPermissions.Result {
        if (props.permissions.length) {
            const keys = await this.resolveKeys(props);
            const cached = await this.read({ ...props, keys });
            if (cached.loaded && !cached.stale) {
                return cached.matched;
            }

            const key = props.globalOnly ? keys[0] : keys[1];
            let refresh = this.refreshes.get(key);

            if (!refresh) {
                refresh = this.loadPermissions({ ...props, keys }).finally(() => {
                    const timer = setTimeout(() => this.refreshes.delete(key), 1000);
                    timer.unref();
                });
                this.refreshes.set(key, refresh);
            }

            if (cached.loaded) {
                void refresh.catch(() => undefined);
                return cached.matched;
            }

            await refresh;
            const loaded = await this.read({ ...props, keys });

            if (loaded.loaded) {
                return loaded.matched;
            } else {
                throw Exception.externalServiceFailed({ messageKey: "services.access-cache.UNAVAILABLE" });
            }
        } else {
            return {};
        }
    }

    public async invalidate(
        props: InfrastructureServices.AccessCache.Invalidate.Props,
    ): InfrastructureServices.AccessCache.Invalidate.Result {
        const fields = new Set<string>();
        for (const item of props.payload.items) {
            if (item.realm === props.payload.realm) {
                fields.add(item.scope === InvalidationScope.ACCOUNT_REALM ? item.account : "*");
            } else {
                throw Exception.invariantViolation({ messageKey: "services.access-cache.REALM_MISMATCH" });
            }
        }

        if (fields.size) {
            await this.executeScript({
                script: "invalidate",
                keys: [`${this.namespace}:required:${props.payload.realm}`],
                args: [props.partition.toString(), props.offset, ...fields],
            });
        }
    }

    public async deleteAll(): InfrastructureServices.AccessCache.DeleteAll.Result {
        await this.redis.incr(`${this.namespace}:generation`);
    }

    public async resolveKeys(
        props: InfrastructureServices.AccessCache.ResolveKeys.Props,
    ): InfrastructureServices.AccessCache.ResolveKeys.Result {
        const { account } = props;
        const realm = props.globalOnly ? SYSTEM_REALM_ID : props.realm;
        const generation = (await this.redis.get(`${this.namespace}:generation`)) ?? "0";
        const prefix = `${this.namespace}:${generation}:${account}`;
        return [
            `${prefix}:${SYSTEM_REALM_ID}:global`,
            `${prefix}:${realm}:realm`,
            `${this.namespace}:required:${SYSTEM_REALM_ID}`,
            `${this.namespace}:required:${realm}`,
        ];
    }

    public async read(
        props: InfrastructureServices.AccessCache.Read.Props,
    ): InfrastructureServices.AccessCache.Read.Result {
        const result = await this.executeScript({
            script: "read",
            keys: props.keys,
            args: [JSON.stringify(props.permissions), props.globalOnly ? "1" : "0", props.account],
        });

        if (isString(result)) {
            return JSON.parse(result);
        } else {
            throw Exception.externalServiceFailed({ messageKey: "services.access-cache.UNAVAILABLE" });
        }
    }

    public async loadPermissions(
        props: InfrastructureServices.AccessCache.LoadPermissions.Props,
    ): InfrastructureServices.AccessCache.LoadPermissions.Result {
        const snapshot = await this.accessControlClient.listEffectivePrivileges({
            realm: props.globalOnly ? SYSTEM_REALM_ID : props.realm,
            account: props.account,
        });

        if (!snapshot.revisioned) {
            throw Exception.externalServiceFailed({ messageKey: "services.access-cache.UNAVAILABLE" });
        }

        const written = await this.executeScript({
            script: "write",
            keys: props.keys,
            args: [JSON.stringify(snapshot), this.ttl.toString(), props.globalOnly ? "1" : "0", props.account],
        });

        if (written !== 1) {
            throw Exception.externalServiceFailed({ messageKey: "services.access-cache.UNAVAILABLE" });
        }
    }

    public async executeScript(
        props: InfrastructureServices.AccessCache.ExecuteScript.Props,
    ): InfrastructureServices.AccessCache.ExecuteScript.Result {
        const { script, keys, args } = props;
        let hash = this.hashes.get(script);
        if (!hash) {
            hash = this.loadScript(script);
            this.hashes.set(script, hash);
        }
        try {
            return await this.redis.evalsha(await hash, keys.length, ...keys, ...args);
        } catch (error) {
            this.hashes.delete(script);
            if (error instanceof Error && error.message.includes("NOSCRIPT")) {
                const reloaded = this.loadScript(script);
                this.hashes.set(script, reloaded);
                return await this.redis.evalsha(await reloaded, keys.length, ...keys, ...args);
            } else {
                throw error;
            }
        }
    }

    public async loadScript(script: InfrastructureServices.AccessCache.Script): Promise<string> {
        const hash = await this.redis.script("LOAD", await this.scripts[script]);
        if (isString(hash)) {
            return hash;
        } else {
            throw Exception.externalServiceFailed({ messageKey: "services.access-cache.UNAVAILABLE" });
        }
    }
}
