declare namespace Commands.Mappers.Organization {
    interface Contract {
        lifecyclePayload(props: Commands.Mappers.Organization.Lifecycle): Topics.Realm.SystemLifecycleMessage["payload"][];
        bootstrapPayload(
            props: Commands.Mappers.Organization.Bootstrap,
        ): Topics.Realm.BootstrapOrganizationRequestedMessage["payload"];
        transferPayload(
            props: Commands.Mappers.Organization.Transfer,
        ): Topics.Realm.TransferOwnershipRequestedMessage["payload"];
        compensationPayload(props: {
            realms: { realm: string }[];
            actor: string;
        }): Topics.Realm.SystemLifecycleMessage["payload"][];
    }

    type Bootstrap = Services.Organization.Create.Result;

    type Transfer = Awaited<Services.Organization.TransferOwnership.Result> & { actor: string };

    type Lifecycle = {
        organizations: Entities.Organization[];
        realms: { realm: string }[];
        actor: string;
    };
}
