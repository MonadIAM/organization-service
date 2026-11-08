declare namespace Fixtures.AccessCache {
    type Snapshot = Awaited<GRPC.AccessControl.Client.Response>;
    type Keys = Awaited<InfrastructureServices.AccessCache.ResolveKeys.Result>;

    namespace Read {
        type Props = {
            permissions: string[];
            globalOnly?: boolean;
            account?: string;
            keys?: Keys;
        };

        type Result = InfrastructureServices.AccessCache.Read.Result;
    }

    namespace Write {
        type Props = {
            snapshot: Snapshot;
            globalOnly?: boolean;
            ttl?: number;
            account?: string;
            keys?: Keys;
        };
    }

    namespace Invalidate {
        type Props = {
            fields: string[];
            offset: string;
            partition?: string;
            global?: boolean;
        };
    }
}
