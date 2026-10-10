declare namespace Commands.Organization {
    interface Contract extends ControllerContract, ConsumerContract {}

    interface ConsumerContract {
        confirmBootstrap: ConfirmBootstrap.Signature;
        rejectBootstrap: RejectBootstrap.Signature;
        confirmTransfer: ConfirmTransfer.Signature;
        rejectTransfer: RejectTransfer.Signature;
    }

    namespace ConfirmBootstrap {
        type Props = Topics.Realm.BootstrapConfirmedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectBootstrap {
        type Props = Topics.Realm.BootstrapRejectedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace ConfirmTransfer {
        type Props = Topics.Realm.TransferOwnershipConfirmedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectTransfer {
        type Props = Topics.Realm.TransferOwnershipRejectedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    interface ControllerContract {
        transferOwnership: TransferOwnership.Signature;
        restore: Restore.Signature;
        create: Create.Signature;
        update: Update.Signature;
        revoke: Revoke.Signature;
        purge: Purge.Signature;
    }

    namespace Create {
        type Props = {
            input: {
                description: string;
                title: string;
            };
            context: Extract.Meta;
            actor: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Update {
        type Props = {
            realm: string;
            input: {
                patch: Partial<Entities.Organization.MutableFields>;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            id: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace TransferOwnership {
        type Props = {
            realm: string;
            input: {
                membership: string;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            id: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Revoke {
        type Props = {
            input: {
                identifiers: string[];
                reason: string;
            };
            context: Extract.Meta;
            global: boolean;
            actor: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Restore {
        type Props = {
            input: {
                identifiers: string[];
                reason: string;
            };
            context: Extract.Meta;
            global: boolean;
            actor: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Purge {
        type Props = {
            input: {
                identifiers: string[];
                reason: string;
            };
            context: Extract.Meta;
            global: boolean;
            actor: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }
}
