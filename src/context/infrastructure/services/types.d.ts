import type { PermissionCode, PrivilegeScope } from "@monadiam/shared";

declare global {
    namespace InfrastructureServices {
        namespace ReauthenticationCache {
            interface Contract extends PublicContract {}

            interface PublicContract {
                exists: Exists.Signature;
                delete: Delete.Signature;
                set: Set.Signature;
            }

            namespace Exists {
                type Props = {
                    session: string;
                };

                type Result = Promise<boolean>;

                type Signature = (props: Props) => Result;
            }

            namespace Delete {
                type Props = {
                    session: string;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace Set {
                type Props = {
                    session: string;
                    ttl: number;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }
        }

        namespace BlacklistCache {
            interface Contract extends PublicContract {}

            interface PublicContract {
                exists: Exists.Signature;
                set: Set.Signature;
            }

            namespace Exists {
                type Props = {
                    session: string;
                };

                type Result = Promise<boolean>;

                type Signature = (props: Props) => Result;
            }

            namespace Set {
                type Props = {
                    session: string;
                    ttl: number;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }
        }

        namespace AccessCache {
            interface Contract extends InternalContract, PublicContract {}

            interface InternalContract {
                resolveVersionedKeys: ResolveVersionedKeys.Signature;
                loadPermissions: LoadPermissions.Signature;
            }

            namespace LoadPermissions {
                type Props = Omit<CheckPermissions.Props, "permissions"> & {
                    keys: Awaited<ResolveVersionedKeys.Result>;
                    globalLoaded: boolean;
                    realmLoaded: boolean;
                };

                type Result = GRPC.AccessControl.Client.Response;

                type Signature = (props: Props) => Result;
            }

            namespace ResolveVersionedKeys {
                type Props = {
                    account: string;
                    realm: string;
                };

                type Result = Promise<{ realm: string; global: string }>;

                type Signature = (props: Props) => Result;
            }

            interface PublicContract {
                checkPermissions: CheckPermissions.Signature;
                deleteAccount: DeleteAccount.Signature;
                deleteRealm: DeleteRealm.Signature;
                deleteAll: DeleteAll.Signature;
                delete: Delete.Signature;
            }

            namespace CheckPermissions {
                type Props = {
                    permissions: PermissionCode[];
                    globalOnly?: boolean;
                    account: string;
                    realm: string;
                };

                type Result = Promise<Partial<Record<PermissionCode, PrivilegeScope>>>;

                type Signature = (props: Props) => Result;
            }

            namespace DeleteAccount {
                type Props = {
                    account: string;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace DeleteRealm {
                type Props = {
                    realm: string;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace DeleteAll {
                type Result = Promise<void>;

                type Signature = () => Result;
            }

            namespace Delete {
                type Props = {
                    account: string;
                    realm: string;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }
        }
    }
}
