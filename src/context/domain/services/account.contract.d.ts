declare namespace Services.Account {
    interface Contract extends ConsumerContract {}

    interface ConsumerContract {
        purge: Purge.Signature;
    }

    namespace Purge {
        type Props = { account: string; transaction: ORM.EntityManager };

        type Result = Promise<{
            access: { realm: string; account: string }[];
            realms: { realm: string }[];
        }>;

        type Signature = (props: Props) => Result;
    }
}
