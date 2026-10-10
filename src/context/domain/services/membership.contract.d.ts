declare namespace Services.Membership {
    interface Contract extends CommandContract {}

    interface CommandContract {
        collectAccess: CollectAccess.Signature;
        confirmJoin: ConfirmJoin.Signature;
        rejectJoin: RejectJoin.Signature;
        suspend: Suspend.Signature;
        resume: Resume.Signature;
        clean: Clean.Signature;
        block: Block.Signature;
        leave: Leave.Signature;
        join: Join.Signature;
    }

    namespace CollectAccess {
        type Props = {
            memberships: Entities.Membership[];
            transaction: ORM.EntityManager;
        };

        type Result = Promise<{ realm: string; account: string }[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Clean {
        type Props = {
            excludedOrganizations: string[];
            transaction: ORM.EntityManager;
            account: string;
        };

        type Result = Promise<{
            memberships: Entities.Membership[];
            access: {
                account: string;
                realm: string;
            }[];
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace ConfirmJoin {
        type Props = Topics.Realm.MembershipJoinConfirmedMessage["payload"] & {
            transaction: ORM.EntityManager;
        };

        type Result = Promise<{ access: { realm: string; account: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectJoin {
        type Props = Topics.Realm.MembershipJoinRejectedMessage["payload"] & {
            transaction: ORM.EntityManager;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace Join {
        type Props = {
            transaction: ORM.EntityManager;
            realm: string;
            input: {
                organization: string;
                account: string;
            };
        };

        type Result = Promise<Entities.Membership>;

        type Signature = (props: Props) => Result;
    }

    namespace Suspend {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<{
            memberships: Entities.Membership[];
            access: {
                account: string;
                realm: string;
            }[];
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Resume {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<{
            memberships: Entities.Membership[];
            access: {
                account: string;
                realm: string;
            }[];
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Leave {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            account: string;
            realm: string;
        };

        type Result = Promise<{
            memberships: Entities.Membership[];
            assignments: {
                project: Entities.ProjectAccountAssignment[];
            };
            access: {
                account: string;
                realm: string;
            }[];
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Block {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<{
            memberships: Entities.Membership[];
            assignments: {
                project: Entities.ProjectAccountAssignment[];
            };
            access: {
                account: string;
                realm: string;
            }[];
        }>;

        type Signature = (props: Props) => Result;
    }
}
