import { MoveMode } from "~context/enums";

declare global {
    namespace Commands.Department {
        interface Contract extends ControllerContract {}

        interface ControllerContract {
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
                input: {
                    parent?: string;
                    children?: string[];
                    description: string;
                    name: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace Move {
            type Props = {
                input: { target: string; targetParent: Nullable<string>; mode: MoveMode; reason: string };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace Update {
            type Props = {
                input: {
                    patch: Partial<Entities.Department.MutableFields>;
                    reason: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
                id: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace ChangeManager {
            type Props = {
                input: {
                    position: Nullable<string>;
                    reason: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
                id: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace Archive {
            type Props = {
                input: {
                    identifiers: string[];
                    reason: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace Restore {
            type Props = {
                input: {
                    identifiers: string[];
                    reason: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }

        namespace Purge {
            type Props = {
                input: {
                    reason: string;
                };
                context: Extract.Meta;
                actor: string;
                realm: string;

                organization: string;
                id: string;
            };

            type Result = Promise<MessageResult>;

            type Signature = (props: Props) => Result;
        }
    }
}
