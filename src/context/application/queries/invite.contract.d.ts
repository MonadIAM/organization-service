import { InviteQueryScope, QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.Invite {
        interface Contract extends PublicContract, InternalContract {}

        interface InternalContract {
            buildReadScope: BuildReadScope.Signature;
        }

        namespace BuildReadScope {
            type Props = {
                scope?: InviteQueryScope;
                permissions: string[];
                actor: string;
                realm: string;
            };

            type Result = ORM.Prefilter<Entities.Invite>;

            type Signature = (props: Props) => Result;
        }

        interface PublicContract {
            findUnique: FindUnique.Signature;
            findMany: FindMany.Signature;
        }

        namespace FindUnique {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                view: ResponseViewType;
                permissions: string[];
                invite: string;
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                view: ResponseViewType;
                invite: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<Entities.Invite>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.Invite.Filters;
                sort: Repositories.Mappers.Invite.Sort;
                scope: InviteQueryScope;
                pagination: Pagination;
                view: ResponseViewType;
                permissions: string[];
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.Invite.Filters;
                sort: Repositories.Mappers.Invite.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Invite[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
