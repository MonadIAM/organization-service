import { QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.Organization {
        interface Contract extends PublicContract, InternalContract {}

        interface InternalContract {
            buildReadScope: BuildReadScope.Signature;
        }

        namespace BuildReadScope {
            type Props = {
                permissions?: string[];
                actor: string;
            };

            type Result = ORM.Prefilter<Entities.Organization>;

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
                organization: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                view: ResponseViewType;
                organization: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<Entities.Organization>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.Organization.Filters;
                sort: Repositories.Mappers.Organization.Sort;
                pagination: Pagination;
                view: ResponseViewType;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.Organization.Filters;
                sort: Repositories.Mappers.Organization.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Organization[], number]>;

            type Signature = (props: Props) => Result;
        }

        namespace GetLookupList {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                pagination: Pagination;
                actor: string;
                term: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                pagination: Pagination;
                term: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Organization[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
