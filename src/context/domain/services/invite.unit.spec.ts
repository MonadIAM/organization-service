import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { InviteUnitHelpers } from "~testing/unit/domain-service/invite.helpers";
import { InviteStatus } from "~context/enums";

/* eslint-disable prettier/prettier */
const REALM_ID        = "00000000-0000-4000-8000-100000000001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-100000000002";
const INVITE_ID       = "00000000-0000-4000-8000-100000000003";
const INVITEE_ID      = "00000000-0000-4000-8000-100000000004";
const INVITER_ID      = "00000000-0000-4000-8000-100000000005";
const ROLE_ID         = "00000000-0000-4000-8000-100000000006";
/* eslint-enable prettier/prettier */

const helpers = new InviteUnitHelpers();

describe("[DomainService] - Invite", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - create", () => {
        it("[case] - creates an invite only when the invitee is not an active member", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
                realm: REALM_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                organizations: [organization],
            });
            repositories.memberships.findUnique.mockImplementation(() => Promise.resolve(null));

            // Act
            const result = await service.create({
                input: {
                    organization: ORGANIZATION_ID,
                    invitee: INVITEE_ID,
                    inviter: INVITER_ID,
                    role: ROLE_ID,
                },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });
            const result1 = result.organization;
            const calls = transaction.persist.mock.calls.slice();
            repositories.memberships.findUnique.mockImplementation(() => Promise.resolve(helpers.createMembership()));
            const result2 = service.create({
                input: {
                    organization: ORGANIZATION_ID,
                    invitee: INVITEE_ID,
                    inviter: INVITER_ID,
                    role: ROLE_ID,
                },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            expect(result1).toBe(organization);
            expect(calls).toContainEqual([result]);
            await expect(result2).rejects.toThrow("services.invite.INVITEE_ALREADY_MEMBER");
        });
    });

    describe("[Method] - accept", () => {
        it("[case] - accepts an invite and delegates membership creation to the domain service", async () => {
            // Arrange
            const invite = helpers.createInvite({
                id: INVITE_ID,
                invitee: INVITEE_ID,
            });
            const membership = helpers.createMembership({
                organization: invite.organization,
                account: INVITEE_ID,
            });
            const { service, repositories, services, transaction } = helpers.service({ invites: [invite] });
            repositories.invites.findUniqueOrThrow.mockImplementation(() => Promise.resolve(invite));
            membership.beginJoin();
            services.memberships.join.mockImplementation(() => Promise.resolve(membership));

            // Act
            const result = await service.accept({
                input: { invite: INVITE_ID, invitee: INVITEE_ID },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            expect(result).toEqual({ invite, membership });
            expect(invite.status).toBe(InviteStatus.ACCEPTING);
            expect(services.memberships.join).toHaveBeenCalledWith({
                input: {
                    organization: invite.organization.id,
                    account: INVITEE_ID,
                },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });
        });
    });

    describe("[Behavior] - invite decisions", () => {
        it("[case] - declines and cancels invites with actor-specific repository scopes", async () => {
            // Arrange
            const invite = helpers.createInvite({
                id: INVITE_ID,
                invitee: INVITEE_ID,
                inviter: INVITER_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                invites: [invite],
            });
            repositories.invites.findUniqueOrThrow.mockImplementation(() => Promise.resolve(invite));

            // Act
            await service.decline({
                input: { invite: INVITE_ID, invitee: INVITEE_ID },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });
            const result = invite.status;
            const pending = helpers.createInvite({
                id: INVITE_ID,
                inviter: INVITER_ID,
            });
            repositories.invites.findUniqueOrThrow.mockImplementation(() => Promise.resolve(pending));
            await service.cancel({
                input: { invite: INVITE_ID, inviter: INVITER_ID },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            expect(result).toBe(InviteStatus.DECLINED);
            expect(pending.status).toBe(InviteStatus.CANCELLED);
        });
    });

    describe("[Method] - invalidate", () => {
        it("[case] - requires invalidate scope and invalidates all selected pending invites", async () => {
            // Arrange
            const first = helpers.createInvite();
            const second = helpers.createInvite();
            const { service, repositories, transaction } = helpers.service({
                invites: [first, second],
            });

            // Act
            const result = service.invalidate({
                input: {},
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });
            await Promise.allSettled([result]);
            const result1 = await service.invalidate({
                input: { account: INVITEE_ID },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            await expect(result).rejects.toThrow("services.invite.INVALIDATION_SCOPE_REQUIRED");
            expect(result1).toEqual([first, second]);
            expect(first.status).toBe(InviteStatus.INVALIDATED);
            expect(second.status).toBe(InviteStatus.INVALIDATED);
            expect(repositories.invites.find).toHaveBeenCalledWith({
                where: {
                    organization: { realm: REALM_ID },
                    status: InviteStatus.PENDING,
                    $or: [{ invitee: INVITEE_ID }, { inviter: INVITEE_ID }],
                },
                transaction: transaction.entityManager,
            });
        });
    });

    describe("[Method] - expire", () => {
        it("[case] - merges and expires provided invites at the supplied time", () => {
            // Arrange
            const at = new Date("2030-01-01T00:00:00.000Z");
            const invite = helpers.createInvite({
                expiresAt: new Date("2029-01-01T00:00:00.000Z"),
            });
            const { service, transaction } = helpers.service();

            // Act
            service.expire({
                entities: [invite],
                transaction: transaction.entityManager,
                at,
            });

            // Assert
            expect(transaction.merge).toHaveBeenCalledWith(invite);
            expect(invite.status).toBe(InviteStatus.EXPIRED);
        });
    });
});
