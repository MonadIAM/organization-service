import { describe, expect, it } from "@jest/globals";
import { isUUID } from "class-validator";

import { MembershipStatus } from "~context/enums";

import { Organization } from "./organization.entity";
import { Membership } from "./membership.entity";

/* eslint-disable prettier/prettier */
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const REALM_ID   = "00000000-0000-4000-8000-000000000002";
/* eslint-enable prettier/prettier */

function createMembership(): Membership {
    const organization = new Organization({
        description: "Description",
        title: "Organization",
        realm: REALM_ID,
    });
    return new Membership({ account: ACCOUNT_ID, organization });
}

describe("[Entity] - Membership", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active membership", () => {
            // Arrange

            // Act
            const membership = createMembership();
            const result = isUUID(membership.id, "4");

            // Assert
            expect(result).toBe(true);
            expect(membership.status).toBe(MembershipStatus.ACTIVE);
            expect(membership.joinedAt).toBeInstanceOf(Date);
        });
    });

    describe("[Behavior] - state transitions", () => {
        it("[case] - suspends and activate membership", () => {
            // Arrange
            const membership = createMembership();
            const joinedAt = membership.joinedAt;
            const suspendedAt = new Date("2026-01-01T00:00:00.000Z");
            const activatedAt = new Date("2026-01-02T00:00:00.000Z");

            // Act
            membership.suspend(suspendedAt);
            const result = membership.status;
            const result1 = membership.suspendedAt;
            membership.activate(activatedAt);

            // Assert
            expect(result).toBe(MembershipStatus.SUSPENDED);
            expect(result1).toBe(suspendedAt);
            expect(membership.status).toBe(MembershipStatus.ACTIVE);
            expect(membership.suspendedAt).toBeUndefined();
            expect(membership.joinedAt).toBe(joinedAt);
            expect(membership.updatedAt).toBe(activatedAt);
        });

        it("[case] - requires a new join process after leaving", () => {
            // Arrange
            const membership = createMembership();
            const leftAt = new Date("2026-01-01T00:00:00.000Z");

            // Act
            membership.leave(leftAt);
            const act = (): unknown => membership.activate();

            // Assert
            expect(act).toThrow("CANNOT_ACTIVATE");
            expect(membership.status).toBe(MembershipStatus.LEFT);
            expect(membership.leftAt).toBe(leftAt);
        });

        it("[case] - clears suspension when membership leaves", () => {
            // Arrange
            const membership = createMembership();

            // Act
            membership.suspend();
            membership.leave();

            // Assert
            expect(membership.status).toBe(MembershipStatus.LEFT);
            expect(membership.suspendedAt).toBeUndefined();
        });

        it("[case] - preserves leftAt when a left membership is blocked", () => {
            // Arrange
            const membership = createMembership();
            const leftAt = new Date("2026-01-01T00:00:00.000Z");
            const blockedAt = new Date("2026-01-02T00:00:00.000Z");

            // Act
            membership.leave(leftAt);
            membership.block(blockedAt);

            // Assert
            expect(membership.status).toBe(MembershipStatus.BLOCKED);
            expect(membership.leftAt).toBe(leftAt);
            expect(membership.blockedAt).toBe(blockedAt);
        });

        it("[case] - treats blocked membership as terminal", () => {
            // Arrange
            const membership = createMembership();

            // Act
            membership.block();
            const act = (): unknown => membership.activate();
            const act1 = (): unknown => membership.suspend();
            const act2 = (): unknown => membership.leave();
            const act3 = (): unknown => membership.block();

            // Assert
            expect(act).toThrow("CANNOT_ACTIVATE");
            expect(act1).toThrow("CANNOT_SUSPEND");
            expect(act2).toThrow("CANNOT_LEAVE");
            expect(act3).toThrow("CANNOT_BLOCK");
        });

        it("[case] - rejects activating an active membership", () => {
            // Arrange
            const membership = createMembership();

            // Act
            const act = (): unknown => membership.activate();

            // Assert
            expect(act).toThrow("CANNOT_ACTIVATE");
        });
        it("[case] - rejects leaving or suspending a left membership", () => {
            // Arrange
            const membership = createMembership();
            membership.leave();

            // Act
            const leave = (): unknown => membership.leave();
            const suspend = (): unknown => membership.suspend();

            // Assert
            expect(leave).toThrow("CANNOT_LEAVE");
            expect(suspend).toThrow("CANNOT_SUSPEND");
        });
    });

    describe("[Method] - beginJoin", () => {
        it("[case] - rejects join from a blocked membership", () => {
            // Arrange
            const membership = createMembership();
            membership.block();

            // Act
            const act = (): unknown => membership.beginJoin();

            // Assert
            expect(act).toThrow("entities.membership.OPERATION_CONFLICT");
            expect(membership.status).toBe(MembershipStatus.BLOCKED);
            expect(membership.process).toBeUndefined();
        });

        it("[case] - rejects a competing join without replacing the current process", () => {
            // Arrange
            const membership = createMembership();
            membership.beginJoin("current");

            // Act
            const act = (): unknown => membership.beginJoin("competing");

            // Assert
            expect(act).toThrow("entities.membership.OPERATION_CONFLICT");
            expect(membership.process).toBe("current");
            expect(membership.status).toBe(MembershipStatus.JOINING);
        });
    });

    describe("[Method] - rejectJoin", () => {
        it("[case] - rejects a late join refusal after confirmation", () => {
            // Arrange
            const membership = createMembership();
            membership.beginJoin();
            membership.confirmJoin(new Date());

            // Act
            const act = (): unknown => membership.rejectJoin("late rejection");

            // Assert
            expect(act).toThrow("entities.membership.OPERATION_CONFLICT");
            expect(membership.status).toBe(MembershipStatus.ACTIVE);
        });
    });
});
