declare namespace Commands.Membership {
    interface Contract extends ControllerContract, InternalContract, ConsumerContract {}

    interface ConsumerContract {
        completeEnsure: CompleteEnsure.Signature;
        rejectEnsure: RejectEnsure.Signature;
        ensure: Ensure.Signature;
        completeLeave: CompleteLeave.Signature;
        rejectLeave: RejectLeave.Signature;
    }

    namespace Ensure {
        type Props = Topics.Realm.MembershipEnsureRequestedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace CompleteEnsure {
        type Props = {
            input:
                | Topics.Realm.MembershipJoinConfirmedMessage["payload"]["input"]
                | Topics.Realm.MembershipJoinRejectedMessage["payload"]["input"];
            incoming: TransactionManager.Service.IncomingMessage;
            actor: string;
            realm: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectEnsure {
        type Props = {
            request: Topics.Realm.MembershipEnsureRequestedMessage["payload"];
            incoming: TransactionManager.Service.IncomingMessage;
            reason: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace CompleteLeave {
        type Props = Topics.Realm.MembershipLeaveRequestedMessage["payload"] & {
            incoming: TransactionManager.Service.IncomingMessage;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectLeave {
        type Props = {
            request: Topics.Realm.MembershipLeaveRequestedMessage["payload"];
            incoming: TransactionManager.Service.IncomingMessage;
            reason: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    interface InternalContract {
        join: Join.Signature;
    }

    namespace Join {
        type Props = {
            input: {
                organization: string;
                account: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    interface ControllerContract {
        suspend: Suspend.Signature;
        resume: Resume.Signature;
        leave: Leave.Signature;
        block: Block.Signature;
    }

    namespace Suspend {
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

    namespace Resume {
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

    namespace Leave {
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

    namespace Block {
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
