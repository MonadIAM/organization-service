declare namespace Commands.Team {
    interface Contract extends ControllerContract {}

    interface ControllerContract {
        changeLead: ChangeLead.Signature;
        archive: Archive.Signature;
        restore: Restore.Signature;
        create: Create.Signature;
        update: Update.Signature;
        purge: Purge.Signature;
    }

    namespace Create {
        type Props = {
            input: {
                description: string;
                department: string;
                name: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Update {
        type Props = {
            input: {
                patch: Partial<Entities.Team.MutableFields>;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
            id: string;
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace ChangeLead {
        type Props = {
            input: {
                position: Nullable<string>;
                reason: string;
            };
            context: Extract.Meta;
            actor: string;
            realm: string;
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
        };

        type Result = Promise<MessageResult>;

        type Signature = (props: Props) => Result;
    }

    namespace Purge {
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
