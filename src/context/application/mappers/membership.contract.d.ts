declare namespace Commands.Mappers.Membership {
    interface Contract {
        ensureConfirmed: EnsureConfirmed.Signature;
        ensureRejected: EnsureRejected.Signature;
        ensureJoin: EnsureJoin.Signature;
        leaveConfirmed: LeaveConfirmed.Signature;
        leaveRejected: LeaveRejected.Signature;
        accessPayload: AccessPayload.Signature;
        joinPayload: JoinPayload.Signature;
    }

    type Ensure = {
        request: Topics.Realm.MembershipEnsureRequestedMessage["payload"];
        membership: Entities.Membership;
        reason?: string;
    };

    namespace EnsureJoin {
        type Props = Ensure;

        type Result = Topics.Realm.MembershipJoinRequestedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace EnsureConfirmed {
        type Props = Ensure;

        type Result = Topics.Realm.MembershipEnsureConfirmedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace EnsureRejected {
        type Props = {
            request: Topics.Realm.MembershipEnsureRequestedMessage["payload"];
            reason?: string;
        };

        type Result = Topics.Realm.MembershipEnsureRejectedMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace LeaveConfirmed {
        type Props = {
            request: Topics.Realm.MembershipLeaveRequestedMessage["payload"];
        };

        type Result = Topics.Realm.MembershipLeaveConfirmedMessage["payload"];

        type Signature = (props: Props) => Result;
    }

    namespace LeaveRejected {
        type Props = {
            request: Topics.Realm.MembershipLeaveRequestedMessage["payload"];
            reason: string;
        };

        type Result = Topics.Realm.MembershipLeaveRejectedMessage["payload"];

        type Signature = (props: Props) => Result;
    }

    type Leave = {
        request: Topics.Realm.MembershipLeaveRequestedMessage["payload"];
        memberships: Entities.Membership[];
        access: { realm: string; account: string }[];
        actor: string;
    };

    namespace AccessPayload {
        type Props = {
            memberships: Entities.Membership[];
            access: { realm: string; account: string }[];
            actor: string;
        };

        type Result = Topics.Realm.AccountAccessMessage["payload"][];

        type Signature = (props: Props) => Result;
    }

    namespace JoinPayload {
        type Props = {
            membership: Entities.Membership;
            actor: string;
        };

        type Result = Topics.Realm.MembershipJoinRequestedMessage["payload"];

        type Signature = (props: Props) => Result;
    }
}
