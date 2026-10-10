declare namespace Commands.Account {
    interface Contract extends ConsumerContract {}

    interface ConsumerContract {
        purge: Purge.Signature;
    }

    namespace Purge {
        type Props = {
            incoming: TransactionManager.Service.IncomingMessage;
            account: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }
}
