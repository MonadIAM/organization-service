import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Redis from "ioredis";

export class AccessCacheFixture {
    public readonly account = "account-a";
    public readonly keys: Fixtures.AccessCache.Keys = [
        "access-cache:v3:0:account-a:system:global",
        "access-cache:v3:0:account-a:realm:realm",
        "access-cache:v3:required:system",
        "access-cache:v3:required:realm",
    ];
    private readonly sources = new Map<string, string>();

    public constructor(public readonly redis: Redis) {}

    public async load(): Promise<void> {
        for await (const name of ["read", "write", "invalidate"]) {
            const source = await readFile(resolve(`src/context/infrastructure/scripts/access-cache-${name}.lua`), "utf8");
            const hash = await this.redis.script("LOAD", source);
            if (typeof hash !== "string") {
                throw new Error("Invalid Redis script hash");
            }
            this.sources.set(name, hash);
        }
    }

    public async read(props: Fixtures.AccessCache.Read.Props): Fixtures.AccessCache.Read.Result {
        const keys = props.keys ?? this.keys;
        const result = await this.redis.evalsha(
            this.hash("read"),
            keys.length,
            ...keys,
            JSON.stringify(props.permissions),
            props.globalOnly ? "1" : "0",
            props.account ?? this.account,
        );
        if (typeof result !== "string") {
            throw new Error("Invalid Redis read result");
        }
        return JSON.parse(result);
    }

    public write(props: Fixtures.AccessCache.Write.Props): Promise<unknown> {
        const keys = props.keys ?? this.keys;
        return this.redis.evalsha(
            this.hash("write"),
            keys.length,
            ...keys,
            JSON.stringify(props.snapshot),
            String(props.ttl ?? 60000),
            props.globalOnly ? "1" : "0",
            props.account ?? this.account,
        );
    }

    public invalidate(props: Fixtures.AccessCache.Invalidate.Props): Promise<unknown> {
        return this.redis.evalsha(
            this.hash("invalidate"),
            1,
            this.keys[props.global ? 2 : 3],
            props.partition ?? "0",
            props.offset,
            ...props.fields,
        );
    }

    public async revision(field: string, global = false): Promise<Record<string, string>> {
        const encoded = await this.redis.hget(this.keys[global ? 2 : 3], field);
        return encoded ? JSON.parse(encoded) : {};
    }

    public async commands(): Promise<Record<string, number>> {
        const info = await this.redis.info("commandstats");
        const result: Record<string, number> = {};
        for (const match of info.matchAll(/cmdstat_(\w+):calls=(\d+)/g)) {
            result[match[1]] = Number(match[2]);
        }
        return result;
    }

    private hash(name: string): string {
        const hash = this.sources.get(name);
        if (!hash) {
            throw new Error(`Script ${name} was not loaded`);
        }
        return hash;
    }
}
