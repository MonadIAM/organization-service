declare namespace Repositories.Team {
    interface Contract extends Repositories.Base.Contract<Entities.Team, Repositories.Mappers.Team.Types> {
        getLookupList: GetLookupList.Signature;
    }

    interface QueryContract extends Pick<Contract, "getLookupList" | "findUniqueOrThrow" | "findMany"> {}

    namespace GetLookupList {
        type Props = {
            prefilter?: ORM.Prefilter<Entities.Team>;
            pagination: Pagination;
            organization?: string;
            department?: string;
            term: string;
        };

        type Result = Promise<[Entities.Team[], number]>;

        type Signature = (props: Props) => Result;
    }
}
