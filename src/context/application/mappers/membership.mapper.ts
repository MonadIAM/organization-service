import { MembershipStatus } from "~context/enums";

export class MembershipMapper implements Commands.Mappers.Membership.Contract {
    public ensureJoin(props: Commands.Mappers.Membership.EnsureJoin.Props): Commands.Mappers.Membership.EnsureJoin.Result {
        if (props.membership.status === MembershipStatus.JOINING) {
            return [
                {
                    actor: props.request.actor,
                    realm: props.request.realm,
                    input: {
                        membership: props.membership.id,
                        hrRequest: props.request.input.process,
                        process: props.membership.process!,
                        command: props.membership.process!,
                        account: props.membership.account,
                    },
                },
            ];
        } else {
            return [];
        }
    }

    public ensureConfirmed(
        props: Commands.Mappers.Membership.EnsureConfirmed.Props,
    ): Commands.Mappers.Membership.EnsureConfirmed.Result {
        return props.membership.status === MembershipStatus.ACTIVE ? [props.request] : [];
    }

    public ensureRejected(
        props: Commands.Mappers.Membership.EnsureRejected.Props,
    ): Commands.Mappers.Membership.EnsureRejected.Result {
        return props.reason === undefined
            ? []
            : [
                  {
                      ...props.request,
                      input: { ...props.request.input, reason: props.reason },
                  },
              ];
    }

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
