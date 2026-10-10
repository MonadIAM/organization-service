declare namespace Services.Team {
    interface Contract extends CommandContract {}

    interface CommandContract {
        changeLead: ChangeLead.Signature;
        archive: Archive.Signature;
        restore: Restore.Signature;
        create: Create.Signature;
        update: Update.Signature;
        purge: Purge.Signature;
    }

    namespace Create {
        type Props = {
            transaction: ORM.EntityManager;
            realm: string;
            input: {
                description: string;
                department: string;
                name: string;
            };
        };

        type Result = Promise<Entities.Team>;

        type Signature = (props: Props) => Result;
    }

    namespace Update {
        type Props = {
            patch: Partial<Entities.Team.MutableFields>;
            transaction: ORM.EntityManager;
            realm: string;
            id: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace ChangeLead {
        type Props = {
            transaction: ORM.EntityManager;
            position: Nullable<string>;
            realm: string;
            id: string;
        };

        type Result = Promise<Entities.Team>;

        type Signature = (props: Props) => Result;
    }

    namespace Archive {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.Team[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Restore {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.Team[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Purge {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.Team[]>;

        type Signature = (props: Props) => Result;
    }
}
