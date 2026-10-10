declare namespace Commands.Mappers.Membership {
    interface Contract {
        joinPayload(props: Commands.Mappers.Membership.Join): Topics.Realm.MembershipJoinRequestedMessage["payload"];
        accessPayload(props: Commands.Mappers.Membership.Access): Topics.Realm.AccountAccessMessage["payload"][];
    }

    type Join = { membership: Entities.Membership; actor: string };

    type Access = {
        memberships: Entities.Membership[];
        access: { realm: string; account: string }[];
        actor: string;
    };
}
