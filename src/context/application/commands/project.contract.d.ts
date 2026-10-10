declare namespace Commands.Project {
    interface Contract extends ControllerContract, ConsumerContract {}

    interface ConsumerContract {
        confirmBootstrap: ConfirmBootstrap.Signature;
        rejectBootstrap: RejectBootstrap.Signature;
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

    interface ControllerContract {
        changeManager: ChangeManager.Signature;
        archive: Archive.Signature;
        restore: Restore.Signature;
        create: Create.Signature;
        update: Update.Signature;
        purge: Purge.Signature;
    }

    namespace Create {
        type Props = {
            input: {
                organization: string;
                description: string;
                realm: string;
                name: string;
            };
            context: Extract.Meta;
            actor: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Update {
        type Props = {
            input: {
                patch: Partial<Entities.Project.MutableFields>;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
            id: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace ChangeManager {
        type Props = {
            input: {
                assignment: Nullable<string>;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
            id: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Archive {
        type Props = {
            input: {
                identifiers: string[];
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
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
            actor: string;
            realm: string;
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
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }
}
