import { QueryMode, ResponseViewType } from "~context/enums";

declare global {
    namespace Queries.Department {
        interface Contract extends PublicContract {}

        interface PublicContract {
            getHierarchyGraph: GetHierarchyGraph.Signature;
            findDescendants: FindDescendants.Signature;
            getLookupList: GetLookupList.Signature;
            findAncestors: FindAncestors.Signature;
            findUnique: FindUnique.Signature;
            findMany: FindMany.Signature;
        }

        namespace FindUnique {
            type Props = {
                view: ResponseViewType;
                organization: string;
                department: string;
                realm: string;
            };

            type Result = Promise<Entities.Department>;

            type Signature = (props: Props) => Result;
        }

        namespace FindMany {
            type DefaultProps = {
                mode: QueryMode.DEFAULT;
                filters: Repositories.Mappers.Department.DefaultFilters;
                sort: Repositories.Mappers.Department.Sort;
                pagination: Pagination;
                view: ResponseViewType;
                organization: string;
                realm: string;
            };

            type ManageProps = {
                mode: QueryMode.MANAGE;
                filters: Repositories.Mappers.Department.ManageFilters;
                sort: Repositories.Mappers.Department.Sort;
                pagination: Pagination;
                view: ResponseViewType;
            };

            type Props = DefaultProps | ManageProps;

            type Result = Promise<[Entities.Department[], number]>;

            type Signature = (props: Props) => Result;
        }

        namespace GetHierarchyGraph {
            type Props = {
                organization: string;
                realm: string;
            };

            type Result = Repositories.Department.GetHierarchyGraph.Result;

            type Signature = (props: Props) => Result;
        }

        namespace FindAncestors {
            type Props = {
                filters: Repositories.Mappers.Department.DefaultFilters;
                view: ResponseViewType;
                pagination: Pagination;
                descendant: string;
                organization: string;
                realm: string;
            };

            type Result = Repositories.Department.FindAncestors.Result;

            type Signature = (props: Props) => Result;
        }

        namespace FindDescendants {
            type Props = {
                filters: Repositories.Mappers.Department.DefaultFilters;
                view: ResponseViewType;
                pagination: Pagination;
                organization: string;
                ancestor: string;
                realm: string;
            };

            type Result = Repositories.Department.FindDescendants.Result;

            type Signature = (props: Props) => Result;
        }

        namespace GetLookupList {
            type Props = {
                pagination: Pagination;
                organization: string;
                realm: string;
                term: string;
            };

            type Result = Promise<[Entities.Department[], number]>;

            type Signature = (props: Props) => Result;
        }
    }
}
