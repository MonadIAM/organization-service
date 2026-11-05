declare namespace Unit.Commands.Membership {
    interface Contract extends Core.Contract {
        commands: Commands.Signature;
    }

    namespace Commands {
        type Result = Core.Execution.Result & {
            commands: globalThis.Commands.Membership.Contract;
            membershipService: Jest.Mocked<
                Pick<
                    Services.Membership.CommandContract,
                    "completeEnsure" | "ensure" | "suspend" | "resume" | "leave" | "block" | "join"
                >
            >;
        };

        type Signature = () => Result;
    }
}
