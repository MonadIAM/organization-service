export class MembershipMapper implements Commands.Mappers.Membership.Contract {
    public leaveConfirmed(
        props: Commands.Mappers.Membership.LeaveConfirmed.Props,
    ): Commands.Mappers.Membership.LeaveConfirmed.Result {
        return props.request;
    }

    public leaveRejected(
        props: Commands.Mappers.Membership.LeaveRejected.Props,
    ): Commands.Mappers.Membership.LeaveRejected.Result {
        return {
            ...props.request,
            input: {
                ...props.request.input,
                reason: props.reason,
            },
        };
    }

    public joinPayload(
        props: Commands.Mappers.Membership.JoinPayload.Props,
    ): Commands.Mappers.Membership.JoinPayload.Result {
        const { membership, actor } = props;

        return {
            actor,
            realm: membership.organization.realm,
            input: {
                process: membership.process!,
                command: membership.process!,
                account: membership.account,
                membership: membership.id,
            },
        };
    }

    public accessPayload(
        props: Commands.Mappers.Membership.AccessPayload.Props,
    ): Commands.Mappers.Membership.AccessPayload.Result {
        return props.access.map(({ realm, account }) => ({
            input: { account },
            actor: props.actor,
            realm,
        }));
    }
}
