declare namespace Repositories.Organization {
    interface Contract extends Repositories.Base.Contract<Entities.Organization, Repositories.Mappers.Organization.Types> {
        hasPendingProcesses: HasPendingProcesses.Signature;
        getLookupList: GetLookupList.Signature;
    }

    type PendingProcessesRow = {
        pending: boolean;
    };

    namespace HasPendingProcesses {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
        };

        type Result = Promise<boolean>;

        type Signature = (props: Props) => Result;
    }

    interface QueryContract extends Pick<Contract, "getLookupList" | "findUniqueOrThrow" | "findMany"> {}

    namespace GetLookupList {
        type Props = {
            prefilter?: ORM.Prefilter<Entities.Organization>;
            pagination: Pagination;
            term: string;
        };

        type Result = Promise<[Entities.Organization[], number]>;

        type Signature = (props: Props) => Result;
    }
}
