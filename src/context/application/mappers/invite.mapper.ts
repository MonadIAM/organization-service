import { NotificationContentKind, NotificationCategory, PlatformService, MessageTemplate } from "~context/enums";

export class InviteMapper implements Commands.Mappers.Invite.Contract {
    public compensationPayload(props: {
        access: { realm: string; account: string }[];
        actor: string;
    }): Topics.Realm.AccountAccessMessage["payload"][] {
        return props.access.map(({ realm, account }) => ({
            actor: props.actor,
            realm,
            input: { account },
        }));
    }

    public joinPayload(props: Commands.Mappers.Invite.Accept): Topics.Realm.MembershipJoinRequestedMessage["payload"] {
        return {
            actor: props.invite.inviter,
            realm: props.membership.organization.realm,
            input: {
                role: props.invite.role ?? undefined,
                process: props.membership.process!,
                command: props.membership.process!,
                account: props.membership.account,
                membership: props.membership.id,
                invite: props.invite.id,
            },
        };
    }

    public notificationPayload(props: Commands.Mappers.Invite.Notification): Topics.Notification.CreateMessage["payload"] {
        return {
            actor: props.inviter,
            realm: props.organization.realm,
            input: {
                sourceService: PlatformService.ORGANIZATION_SERVICE,
                template: MessageTemplate.INVITE_RECEIVED,
                kind: NotificationContentKind.TEMPLATE,
                category: NotificationCategory.SYSTEM,
                recipient: props.invitee,
                dedupKey: `invite:${props.id}`,
                language: "en",
                params: { realm: props.organization.title, inviter: props.inviter },
            },
        };
    }

    public cancellationPayload(props: Commands.Mappers.Invite.Notification): Topics.Notification.CreateMessage["payload"] {
        return {
            actor: props.inviter,
            realm: props.organization.realm,
            input: {
                sourceService: PlatformService.ORGANIZATION_SERVICE,
                template: MessageTemplate.INVITE_CANCELLED,
                kind: NotificationContentKind.TEMPLATE,
                category: NotificationCategory.SYSTEM,
                recipient: props.invitee,
                language: "en",
                params: { realm: props.organization.title, inviter: props.inviter },
            },
        };
    }
}
