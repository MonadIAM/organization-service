declare namespace Services.Organization {
    interface Contract extends CommandContract {}

    interface CommandContract {
        transferOwnership: TransferOwnership.Signature;
        confirmBootstrap: ConfirmBootstrap.Signature;
        rejectBootstrap: RejectBootstrap.Signature;
        confirmTransfer: ConfirmTransfer.Signature;
        rejectTransfer: RejectTransfer.Signature;
        collectRealms: CollectRealms.Signature;
        purgeOwned: PurgeOwned.Signature;
        restore: Restore.Signature;
        create: Create.Signature;
        update: Update.Signature;
        revoke: Revoke.Signature;
        purge: Purge.Signature;
    }

    namespace PurgeOwned {
        type Props = { account: string; transaction: ORM.EntityManager };

        type Result = Purge.Result;

        type Signature = (props: Props) => Result;
    }

    namespace CollectRealms {
        type Props = { organizations: Entities.Organization[]; transaction: ORM.EntityManager };

        type Result = Promise<{ realm: string }[]>;

        type Signature = (props: Props) => Result;
    }

    namespace ConfirmBootstrap {
        type Props = Topics.Realm.BootstrapConfirmedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Promise<{ realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectBootstrap {
        type Props = Topics.Realm.BootstrapRejectedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Promise<{ realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace ConfirmTransfer {
        type Props = Topics.Realm.TransferOwnershipConfirmedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Promise<{ realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace RejectTransfer {
        type Props = Topics.Realm.TransferOwnershipRejectedMessage["payload"] & { transaction: ORM.EntityManager };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace Create {
        type Props = {
            transaction: ORM.EntityManager;
            actor: string;
            input: {
                description: string;
                title: string;
            };
        };

        type Result = {
            organization: Entities.Organization;
            membership: Entities.Membership;
        };

        type Signature = (props: Props) => Result;
    }

    namespace Update {
        type Props = {
            realm: string;
            patch: Partial<Entities.Organization.MutableFields>;
            transaction: ORM.EntityManager;
            id: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace TransferOwnership {
        type Props = {
            realm: string;
            transaction: ORM.EntityManager;
            membership: string;
            id: string;
        };

        type Result = Promise<{
            organization: Entities.Organization;
            previousOwner: string;
            owner: string;
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Revoke {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            global: boolean;
            actor: string;
        };

        type Result = Promise<{ organizations: Entities.Organization[]; realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace Restore {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            global: boolean;
            actor: string;
        };

        type Result = Promise<{ organizations: Entities.Organization[]; realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }

    namespace Purge {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            global: boolean;
            actor: string;
        };

        type Result = Promise<{ organizations: Entities.Organization[]; realms: { realm: string }[] }>;

        type Signature = (props: Props) => Result;
    }
}
