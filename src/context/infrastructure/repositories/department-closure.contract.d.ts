declare namespace Repositories.DepartmentClosure {
    interface Contract extends PublicContract {}

    interface PublicContract {
        decreaseTransitiveDepth: DecreaseTransitiveDepth.Signature;
        existsTransitivePath: ExistsTransitivePath.Signature;
        insertNewHierarchy: InsertNewHierarchy.Signature;
        moveSubtrees: MoveSubtrees.Signature;
        move: Move.Signature;
    }

    namespace DecreaseTransitiveDepth {
        type Props = {
            transaction: ORM.EntityManager;
            organization: string;
            department: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace ExistsTransitivePath {
        type Props = {
            transaction: ORM.EntityManager;
            descendant: string;
            ancestor: string;
            organization: string;
        };

        type Result = Promise<boolean>;

        type Signature = (props: Props) => Result;
    }

    namespace InsertNewHierarchy {
        type Props = {
            transaction: ORM.EntityManager;
            descendant: string;
            ancestor?: string;
            organization: string;
        };

        type Result = Promise<void>;

        type Signature = (props: Props) => Result;
    }

    namespace MoveSubtrees {
        type Props = {
            transaction: ORM.EntityManager;
            oldParent: Nullable<string>;
            newParent: Nullable<string>;
            children: string[];
            organization: string;
        };

        type Result = Promise<{
            removedPaths: Omit<Entities.DepartmentClosure, "organization" | "depth">[];
            upsertedPaths: Omit<Entities.DepartmentClosure, "organization">[];
        }>;

        type Signature = (props: Props) => Result;
    }

    namespace Move {
        type Props = {
            transaction: ORM.EntityManager;
            newParent: Nullable<string>;
            target: string;
            organization: string;
        };

        type Result = Promise<{
            removedPaths: Omit<Entities.DepartmentClosure, "organization" | "depth">[];
            upsertedPaths: Omit<Entities.DepartmentClosure, "organization">[];
        }>;

        type Signature = (props: Props) => Result;
    }
}
