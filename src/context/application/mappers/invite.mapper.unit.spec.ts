import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { InviteMapper } from "./invite.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new InviteMapper();

describe("[DataMapper] - Invite", () => {
    describe("[Method] - joinPayload", () => {
        it.each(["selected-role", undefined])("[case] - maps invitation acceptance with role %s", (role) => {
            // Arrange
            const invite = helpers.createInvite({ role });
            const membership = helpers.createMembership({ organization: invite.organization, account: invite.invitee });
            membership.beginJoin();

            // Act
            const payload = mapper.joinPayload({ invite, membership });

            // Assert
            expect(payload.actor).toBe(invite.inviter);
            expect(payload.input.role).toBe(role);
            expect(payload.input.invite).toBe(invite.id);
            expect(payload.input.membership).toBe(membership.id);
            expect(payload.input.account).toBe(invite.invitee);
        });
    });

    describe("[Method] - notificationPayload", () => {
        it("[case] - provides all invitation template parameters and a stable deduplication key", () => {
            // Arrange
            const invite = helpers.createInvite();

            // Act
            const payload = mapper.notificationPayload(invite);

            // Assert
            expect(payload.input).toEqual(
                expect.objectContaining({
                    dedupKey: `invite:${invite.id}`,
                    recipient: invite.invitee,
                    params: { inviter: invite.inviter, realm: invite.organization.title },
                }),
            );
        });
    });
});
