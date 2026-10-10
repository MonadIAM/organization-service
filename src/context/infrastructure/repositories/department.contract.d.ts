declare namespace Repositories.Department {
    interface Contract extends Repositories.Base.Contract<Entities.Department, Repositories.Mappers.Department.Types> {
        getHierarchyGraph: GetHierarchyGraph.Signature;
        findDescendants: FindDescendants.Signature;
        getDescendants: GetDescendants.Signature;
        findAncestors: FindAncestors.Signature;
        getLookupList: GetLookupList.Signature;
        getAncestors: GetAncestors.Signature;
    }

    interface QueryContract extends Pick<
        Contract,
        "getLookupList" | "findUniqueOrThrow" | "findMany" | "getHierarchyGraph" | "findAncestors" | "findDescendants"
    > {}

    namespace GetAncestors {
        type Props = {
            options?: ORM.FindOptions<Entities.DepartmentClosure>;
            where?: ORM.FilterQuery<Entities.Department>;
            transaction: ORM.EntityManager;
            descendant: string | { $in: string[] };
            depth?: number;
        };

        type Result = Promise<Entities.Department[]>;

        type Signature = (props: Props) => Result;
    }
    namespace GetDescendants {
        type Props = {
            options?: ORM.FindOptions<Entities.DepartmentClosure>;
            where?: ORM.FilterQuery<Entities.Department>;
            transaction: ORM.EntityManager;
            ancestor: string;
            depth?: number;
        };

        type Result = Promise<Entities.Department[]>;

        type Signature = (props: Props) => Result;
    }
    namespace Graph {
        type Data = {
            nodes: {
                id: string;
                label: string;
                attributes: {
                    status: Entities.Department["status"];
                };
            }[];
            edges: {
                id: string;
                source: string;
                target: string;
            }[];
        };
    }
    namespace GetHierarchyGraph {
        type Props = {
            transaction?: ORM.EntityManager;
            organization: string;
            realm: string;
        };

        type Result = Promise<Graph.Data>;

        type Signature = (props: Props) => Result;
    }
    namespace FindAncestors {
        type Props = {
            populate: readonly ORM.EntityKey<Entities.Department>[];
            filters: Repositories.Mappers.Department.DefaultFilters;
            pagination: Pagination;
            organization: string;
            descendant: string;
            realm: string;
        };

        type Result = Promise<[(Entities.Department & { depth: number })[], number]>;

        type Signature = (props: Props) => Result;
    }
    namespace FindDescendants {
        type Props = {
            populate: readonly ORM.EntityKey<Entities.Department>[];
            filters: Repositories.Mappers.Department.DefaultFilters;
            pagination: Pagination;
            organization: string;
            ancestor: string;
            realm: string;
        };

        type Result = FindAncestors.Result;

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
