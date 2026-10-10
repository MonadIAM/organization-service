import { MoveMode } from "~context/enums";

declare global {
    namespace Services.Department {
        interface Contract extends CommandContract, InternalContract {}

        interface InternalContract {
            buildHierarchy: BuildHierarchy.Signature;
        }

        interface CommandContract {
            changeManager: ChangeManager.Signature;
            archive: Archive.Signature;
            restore: Restore.Signature;
            create: Create.Signature;
            update: Update.Signature;
            purge: Purge.Signature;
            move: Move.Signature;
        }

        namespace Create {
            type Props = {
                transaction: ORM.EntityManager;
                organization: string;
                realm: string;
                input: {
                    parent?: string;
                    children?: string[];
                    description: string;
                    name: string;
                };
            };

            type Result = Promise<Entities.Department>;

            type Signature = (props: Props) => Result;
        }

        namespace BuildHierarchy {
            type Props = {
                transaction: ORM.EntityManager;
                input: {
                    children?: string[];
                    parent?: Entities.Department;
                    entity: Entities.Department;
                    organization: string;
                };
            };

            type Result = Promise<void>;

            type Signature = (props: Props) => Result;
        }

        namespace Move {
            type Props = {
                transaction: ORM.EntityManager;
                organization: string;
                realm: string;
                target: string;
                targetParent: Nullable<string>;
                mode: MoveMode;
            };

            type Result = Promise<void>;

            type Signature = (props: Props) => Result;
        }

        namespace Update {
            type Props = {
                patch: Partial<Entities.Department.MutableFields>;
                transaction: ORM.EntityManager;
                organization: string;
                realm: string;
                id: string;
            };

            type Result = Promise<void>;

            type Signature = (props: Props) => Result;
        }

        namespace ChangeManager {
            type Props = {
                transaction: ORM.EntityManager;
                position: Nullable<string>;
                organization: string;
                realm: string;
                id: string;
            };

            type Result = Promise<Entities.Department>;

            type Signature = (props: Props) => Result;
        }

        namespace Archive {
            type Props = {
                transaction: ORM.EntityManager;
                identifiers: string[];
                organization: string;
                realm: string;
            };

            type Result = Promise<Entities.Department[]>;

            type Signature = (props: Props) => Result;
        }

        namespace Restore {
            type Props = {
                transaction: ORM.EntityManager;
                identifiers: string[];
                organization: string;
                realm: string;
            };

            type Result = Promise<Entities.Department[]>;

            type Signature = (props: Props) => Result;
        }

        namespace Purge {
            type Props = {
                transaction: ORM.EntityManager;
                id: string;
                organization: string;
                realm: string;
            };

            type Result = Promise<Entities.Department>;

            type Signature = (props: Props) => Result;
        }
    }
}
