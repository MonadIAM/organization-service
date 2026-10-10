declare namespace Commands.Mappers.Project {
    interface Contract {
        lifecyclePayload(props: Commands.Mappers.Project.Lifecycle): Topics.Realm.SystemLifecycleMessage["payload"][];
        bootstrapPayload(
            props: Commands.Mappers.Project.Bootstrap,
        ): Topics.Realm.BootstrapProjectRequestedMessage["payload"];
        compensationPayload(props: {
            realms: { realm: string }[];
            actor: string;
        }): Topics.Realm.SystemLifecycleMessage["payload"][];
    }

    type Bootstrap = {
        project: Entities.Project;
        actor: string;
    };

    type Lifecycle = {
        projects: Entities.Project[];
        actor: string;
    };
}
