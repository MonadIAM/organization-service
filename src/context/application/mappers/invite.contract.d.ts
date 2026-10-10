declare namespace Commands.Mappers.Invite {
    interface Contract {
        notificationPayload(props: Commands.Mappers.Invite.Notification): Topics.Notification.CreateMessage["payload"];
        cancellationPayload(props: Commands.Mappers.Invite.Notification): Topics.Notification.CreateMessage["payload"];
        joinPayload(props: Commands.Mappers.Invite.Accept): Topics.Realm.MembershipJoinRequestedMessage["payload"];
        compensationPayload(props: {
            access: { realm: string; account: string }[];
            actor: string;
        }): Topics.Realm.AccountAccessMessage["payload"][];
    }

    type Accept = Awaited<Services.Invite.Accept.Result>;

    type Notification = Entities.Invite;
}
