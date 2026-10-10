declare namespace Commands.Invite {
    interface Contract extends ControllerContract, InternalContract, ProcessorContract, ConsumerContract {}

    interface InternalContract {
        invalidate: Invalidate.Signature;
    }

    namespace Invalidate {
        type Props = {
            input: {
                organization?: string;
                account?: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    interface ProcessorContract {
        expire: Expire.Signature;
    }

    namespace Expire {
        type Props = {
            expirationDate: Date;
            batchSize: number;
        };

        type Result = Promise<number>;

        type Signature = (props: Props) => Result;
    }

    interface ConsumerContract {
        confirmJoin: ConfirmJoin.Signature;
        rejectJoin: RejectJoin.Signature;
    }

    namespace ConfirmJoin {
        type Props = Topics.Realm.MembershipJoinConfirmedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectJoin {
        type Props = Topics.Realm.MembershipJoinRejectedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    interface ControllerContract {
        decline: Decline.Signature;
        accept: Accept.Signature;
        cancel: Cancel.Signature;
        create: Create.Signature;
    }

    namespace Create {
        type Props = {
            input: {
                organization: string;
                expiresAt?: Date;
                invitee: string;
                role?: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Accept {
        type Props = {
            input: { invite: string };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Decline {
        type Props = {
            input: { invite: string };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Cancel {
        type Props = {
            input: { invite: string };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }
}
