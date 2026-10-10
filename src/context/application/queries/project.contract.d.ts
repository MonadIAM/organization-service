import { QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.Project {
        interface Contract extends PublicContract, InternalContract {}

        interface PublicContract {
            getLookupList: GetLookupList.Signature;
            findUnique: FindUnique.Signature;
            findMany: FindMany.Signature;
        }

        interface InternalContract {
            buildReadScope: BuildReadScope.Signature;
        }

        namespace BuildReadScope {
            type Props = {
                permissions: string[];
                actor: string;
                realm: string;
            };

            type Result = ORM.Prefilter<Entities.Project>;

            type Signature = (props: Props) => Result;
        }

        namespace FindUnique {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                view: ResponseViewType;
                permissions: string[];
                project: string;
                realm: string;
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                view: ResponseViewType;
                project: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<Entities.Project>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.Project.Filters;
                sort: Repositories.Mappers.Project.Sort;
                pagination: Pagination;
                view: ResponseViewType;
                realm: string;
                permissions: string[];
                actor: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.Project.Filters;
                sort: Repositories.Mappers.Project.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Project[], number]>;

            type Signature = (props: Props) => Result;
        }

        namespace GetLookupList {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                pagination: Pagination;
                organization?: string;
                permissions: string[];
                actor: string;
                realm: string;
                term: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                pagination: Pagination;
                organization?: string;
                term: string;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Project[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
