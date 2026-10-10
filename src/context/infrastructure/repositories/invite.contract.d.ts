declare namespace Repositories.Invite {
    interface Contract extends Repositories.Base.Contract<Entities.Invite, Repositories.Mappers.Invite.Types> {
        findExpiredPending: FindExpiredPending.Signature;
    }

    interface QueryContract extends Pick<Contract, "findUniqueOrThrow" | "findMany"> {}

    namespace FindExpiredPending {
        type Props = {
            transaction?: ORM.EntityManager;
            expirationDate: Date;
            batchSize: number;
        };

        type Result = Promise<Entities.Invite[]>;

        type Signature = (props: Props) => Result;
    }
}
