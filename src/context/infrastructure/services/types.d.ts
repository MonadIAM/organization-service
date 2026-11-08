import type { PermissionCode, PrivilegeScope } from "@monadiam/shared";

import { ReauthenticationMethod } from "~context/enums";

declare global {
    namespace InfrastructureServices {
        namespace ReauthenticationCache {
            type Proof = Topics.Reauthentication.Proof;

            interface Contract extends PublicContract {}

            interface PublicContract {
                exists: Exists.Signature;
                delete: Delete.Signature;
                set: Set.Signature;
                get: Get.Signature;
            }

            namespace Exists {
                type Props = {
                    methods?: ReauthenticationMethod[];
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
                    proof?: Proof;
                    ttl: number;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace Get {
                type Props = {
                    session: string;
                    method: ReauthenticationMethod;
                };

                type Result = Promise<Nullable<Proof>>;

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
            type Script = "read" | "write" | "invalidate";

            namespace ExecuteScript {
                type Props = { script: Script; keys: string[]; args: string[] };

                type Result = Promise<unknown>;
            }

            interface Contract extends InternalContract, PublicContract {}

            interface InternalContract {
                loadPermissions: LoadPermissions.Signature;
                resolveKeys: ResolveKeys.Signature;
                read: Read.Signature;
            }

            interface PublicContract {
                checkPermissions: CheckPermissions.Signature;
                invalidate: Invalidate.Signature;
                deleteAll: DeleteAll.Signature;
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

            namespace ResolveKeys {
                type Props = Omit<CheckPermissions.Props, "permissions">;

                type Result = Promise<[string, string, string, string]>;

                type Signature = (props: Props) => Result;
            }

            namespace Read {
                type Props = CheckPermissions.Props & { keys: Awaited<ResolveKeys.Result> };

                type Result = Promise<{
                    matched: Awaited<CheckPermissions.Result>;
                    loaded: boolean;
                    stale: boolean;
                }>;

                type Signature = (props: Props) => Result;
            }

            namespace LoadPermissions {
                type Props = ResolveKeys.Props & { keys: Awaited<ResolveKeys.Result> };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace Invalidate {
                type Props = {
                    payload: Topics.ProjectionJournal.Checkpoint["payload"];
                    partition: number;
                    offset: string;
                };

                type Result = Promise<void>;

                type Signature = (props: Props) => Result;
            }

            namespace DeleteAll {
                type Result = Promise<void>;

                type Signature = () => Result;
            }
        }
    }
}
