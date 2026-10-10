declare namespace Services.ProjectAccountAssignment {
    interface Contract extends CommandContract, InternalContract {}

    interface InternalContract {
        clean: Clean.Signature;
    }

    namespace Clean {
        type Props = {
            transaction: ORM.EntityManager;
            memberships: string[];
        };

        type Result = Promise<Entities.ProjectAccountAssignment[]>;

        type Signature = (props: Props) => Result;
    }

    interface CommandContract {
        restore: Restore.Signature;
        create: Create.Signature;
        revoke: Revoke.Signature;
        purge: Purge.Signature;
    }

    namespace Create {
        type Props = {
            transaction: ORM.EntityManager;
            actor: string;
            realm: string;
            input: {
                membership: string;
                project: string;
            };
        };

        type Result = Promise<Entities.ProjectAccountAssignment>;

        type Signature = (props: Props) => Result;
    }

    namespace Revoke {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.ProjectAccountAssignment[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Restore {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.ProjectAccountAssignment[]>;

        type Signature = (props: Props) => Result;
    }

    namespace Purge {
        type Props = {
            transaction: ORM.EntityManager;
            identifiers: string[];
            realm: string;
        };

        type Result = Promise<Entities.ProjectAccountAssignment[]>;

        type Signature = (props: Props) => Result;
    }
}
