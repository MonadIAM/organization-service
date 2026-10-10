declare namespace Repositories.Project {
    interface Contract extends Repositories.Base.Contract<Entities.Project, Repositories.Mappers.Project.Types> {
        getLookupList: GetLookupList.Signature;
    }

    interface QueryContract extends Pick<Contract, "getLookupList" | "findUniqueOrThrow" | "findMany"> {}

    namespace GetLookupList {
        type Props = {
            organization?: string;
            prefilter?: ORM.Prefilter<Entities.Project>;
            pagination: Pagination;
            term: string;
        };

        type Result = Promise<[Entities.Project[], number]>;

        type Signature = (props: Props) => Result;
    }
}
