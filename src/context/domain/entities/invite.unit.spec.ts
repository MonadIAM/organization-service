import { describe, expect, it } from "@jest/globals";

import { InviteStatus } from "~context/enums";

import { Organization } from "./organization.entity";
import { Invite } from "./invite.entity";

/* eslint-disable prettier/prettier */
const INVITEE_ID = "00000000-0000-4000-8000-000000000001";
const INVITER_ID = "00000000-0000-4000-8000-000000000002";
const REALM_ID   = "00000000-0000-4000-8000-000000000003";
const ROLE_ID    = "00000000-0000-4000-8000-000000000004";
/* eslint-enable prettier/prettier */

const BEFORE_EXPIRATION = new Date("2029-01-01T00:00:00.000Z");
const EXPIRES_AT = new Date("2030-01-01T00:00:00.000Z");

function createInvite(props: Partial<Entities.Invite.ConstructorProps> = {}): Invite {
    const organization = new Organization({
        description: "Description",
        realm: REALM_ID,
        title: "Organization",
    });
    return new Invite({
        invitee: INVITEE_ID,
        inviter: INVITER_ID,
        role: ROLE_ID,
        organization,
        expiresAt: EXPIRES_AT,
        ...props,
    });
}

describe("[Entity] - Invite", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes a pending invite", () => {
            // Arrange

            // Act
            const invite = createInvite();

            // Assert
            expect(invite.status).toBe(InviteStatus.PENDING);
            expect(invite.expiresAt).toBe(EXPIRES_AT);
            expect(invite.updatedAt).toBeUndefined();
        });
    });

    describe("[Behavior] - state transitions", () => {
        it.each([
            ["accept", InviteStatus.ACCEPTED],
            ["decline", InviteStatus.DECLINED],
            ["cancel", InviteStatus.CANCELLED],
            ["invalidate", InviteStatus.INVALIDATED],
        ] as const)("[case] - %s an unexpired pending invite", (method, status) => {
            // Arrange
            const invite = createInvite();

            // Act
            invite[method](BEFORE_EXPIRATION);

            // Assert
            expect(invite.status).toBe(status);
            expect(invite.updatedAt).toBe(BEFORE_EXPIRATION);
        });

        it.each([
            { method: "accept", error: "CANNOT_ACCEPT_EXPIRED" },
            { method: "decline", error: "CANNOT_DECLINE_EXPIRED" },
            { method: "cancel", error: "CANNOT_CANCEL_EXPIRED" },
            { method: "invalidate", error: "CANNOT_INVALIDATE_EXPIRED" },
        ] as const)("[case] - rejects $method at the expiration deadline", ({ method, error }) => {
            // Arrange
            const invite = createInvite();

            // Act
            const act = (): unknown => invite[method](EXPIRES_AT);

            // Assert
            expect(act).toThrow(error);
        });

        it("[case] - rejects a second terminal transition", () => {
            // Arrange
            const invite = createInvite();
            invite.accept(BEFORE_EXPIRATION);

            // Act
            const act = (): unknown => invite.cancel(BEFORE_EXPIRATION);
            const act1 = (): unknown => invite.expire(EXPIRES_AT);

            // Assert
            expect(act).toThrow("CANNOT_CANCEL_INACTIVE");
            expect(act1).toThrow("CANNOT_EXPIRE_INACTIVE");
        });
    });

    describe("[Method] - accept", () => {
        it("[case] - allows an invite without expiresAt to finish", () => {
            // Arrange
            const invite = createInvite({ expiresAt: undefined });

            // Act
            invite.accept(BEFORE_EXPIRATION);

            // Assert
            expect(invite.status).toBe(InviteStatus.ACCEPTED);
        });
    });

    describe("[Method] - expire", () => {
        it("[case] - expires a pending invite when its deadline is reached", () => {
            // Arrange
            const invite = createInvite();

            // Act
            invite.expire(EXPIRES_AT);

            // Assert
            expect(invite.status).toBe(InviteStatus.EXPIRED);
            expect(invite.updatedAt).toBe(EXPIRES_AT);
        });

        it.each([
            { scenario: "before its deadline", expiresAt: EXPIRES_AT },
            { scenario: "without a deadline", expiresAt: undefined },
        ])("[case] - rejects expiring an invite $scenario", ({ expiresAt }) => {
            // Arrange
            const invite = createInvite({ expiresAt });

            // Act
            const act = (): unknown => invite.expire(BEFORE_EXPIRATION);

            // Assert
            expect(act).toThrow("CANNOT_EXPIRE_UNDUE");
        });
    });

    describe("[Method] - confirmAccept", () => {
        it("[case] - rejects completion of an invitation that is not being accepted", () => {
            // Arrange
            const invite = createInvite();

            // Act
            const act = (): unknown => invite.confirmAccept();

            // Assert
            expect(act).toThrow("entities.invite.OPERATION_CONFLICT");
            expect(invite.status).toBe(InviteStatus.PENDING);
        });
    });

    describe("[Method] - rejectAccept", () => {
        it("[case] - rejects late acceptance failure after confirmation", () => {
            // Arrange
            const invite = createInvite();
            invite.beginAccept("process");
            invite.confirmAccept();

            // Act
            const act = (): unknown => invite.rejectAccept("late rejection");

            // Assert
            expect(act).toThrow("entities.invite.OPERATION_CONFLICT");
            expect(invite.status).toBe(InviteStatus.ACCEPTED);
        });
    });
});
