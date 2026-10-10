declare namespace Services.Invite {
    interface Contract extends CommandContract {}

    interface CommandContract {
        confirmJoin: ConfirmJoin.Signature;
        rejectJoin: RejectJoin.Signature;
        invalidate: Invalidate.Signature;
        decline: Decline.Signature;
        accept: Accept.Signature;
        cancel: Cancel.Signature;
        create: Create.Signature;
        expire: Expire.Signature;
    }

    namespace ConfirmJoin {
        type Props = Topics.Realm.MembershipJoinConfirmedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Services.Membership.ConfirmJoin.Result;

        type Signature = (props: Props) => Result;
    }

    namespace RejectJoin {
        type Props = Topics.Realm.MembershipJoinRejectedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace Create {
        type Props = {
            transaction: ORM.EntityManager;
            input: {
                organization: string;
                expiresAt?: Date;
                invitee: string;
                inviter: string;
                role?: string;
            };
            realm: string;
        };

        type Result = Promise<Entities.Invite>;

        type Signature = (props: Props) => Result;
    }

    namespace Accept {
        type Props = {
            transaction: ORM.EntityManager;
            input: {
                invitee: string;
                invite: string;
            };
            realm: string;
        };

        type Result = Promise<{
            membership: Entities.Membership;
            invite: Entities.Invite;
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Decline {
        type Props = {
            transaction: ORM.EntityManager;
            input: {
                invitee: string;
                invite: string;
            };
            realm: string;
        };

        type Result = Promise<Entities.Invite>;

        type Signature = (props: Props) => Result;
    }

    namespace Cancel {
        type Props = {
            transaction: ORM.EntityManager;
            input: {
                inviter?: string;
                invite: string;
            };
            realm: string;
        };

        type Result = Promise<Entities.Invite>;

        type Signature = (props: Props) => Result;
    }

    namespace Invalidate {
        type Props = {
            transaction: ORM.EntityManager;
            input: {
                organization?: string;
                account?: string;
            };
            realm: string;
        };

        type Result = Promise<Entities.Invite[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Expire {
        type Props = {
            transaction: ORM.EntityManager;
            entities: Entities.Invite[];
            at: Date;
        };

        type Result = void;

        type Signature = (props: Props) => Result;
    }
}
