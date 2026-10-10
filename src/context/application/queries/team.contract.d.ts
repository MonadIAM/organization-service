import { QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.Team {
        interface Contract extends PublicContract, InternalContract {}

        interface InternalContract {
            buildReadScope: BuildReadScope.Signature;
        }

        namespace BuildReadScope {
            type Props = {
                permissions: string[];
                actor: string;
                realm: string;
            };

            type Result = ORM.Prefilter<Entities.Team>;

            type Signature = (props: Props) => Result;
        }

        interface PublicContract {
            getLookupList: GetLookupList.Signature;
            findUnique: FindUnique.Signature;
            findMany: FindMany.Signature;
        }

        namespace FindUnique {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                view: ResponseViewType;
                permissions: string[];
                realm: string;
                actor: string;
                team: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                view: ResponseViewType;
                team: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<Entities.Team>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.Team.Filters;
                sort: Repositories.Mappers.Team.Sort;
                pagination: Pagination;
                view: ResponseViewType;
                permissions: string[];
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.Team.Filters;
                sort: Repositories.Mappers.Team.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Team[], number]>;

            type Signature = (props: Props) => Result;
        }

        namespace GetLookupList {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                pagination: Pagination;
                organization?: string;
                permissions: string[];
                department?: string;
                realm: string;
                actor: string;
                term: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                pagination: Pagination;
                organization?: string;
                department?: string;
                term: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Team[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
