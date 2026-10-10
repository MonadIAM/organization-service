import { describe, expect, it } from "@jest/globals";
import { isUUID } from "class-validator";

import { OrganizationStatus } from "~context/enums";

import { Organization } from "./organization.entity";
import { Membership } from "./membership.entity";

/* eslint-disable prettier/prettier */
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const REALM_ID   = "00000000-0000-4000-8000-000000000002";
/* eslint-enable prettier/prettier */

function createOrganization(): Organization {
    return new Organization({
        description: "Description",
        title: "Organization",
        realm: REALM_ID,
    });
}

function createMembership(organization: Organization): Membership {
    return new Membership({ account: ACCOUNT_ID, organization });
}

describe("[Entity] - Organization", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active organization", () => {
            // Arrange

            // Act
            const organization = createOrganization();
            const result = isUUID(organization.id, "4");

            // Assert
            expect(result).toBe(true);
            expect(organization.status).toBe(OrganizationStatus.ACTIVE);
            expect(organization.createdAt).toBeInstanceOf(Date);
            expect(organization.version).toBe(1);
        });
    });

    describe("[Method] - transferOwnership", () => {
        it("[case] - transfers ownership", () => {
            // Arrange
            const organization = createOrganization();
            const membership = createMembership(organization);

            // Act
            organization.transferOwnership({ membership });

            // Assert
            expect(organization.owner).toBe(membership);
            expect(organization.updatedAt).toBeInstanceOf(Date);
        });

        it("[case] - rejects transferring ownership to the current owner", () => {
            // Arrange
            const organization = createOrganization();
            const membership = createMembership(organization);
            organization.transferOwnership({ membership });

            // Act
            const act = (): unknown => organization.transferOwnership({ membership });

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Method] - update", () => {
        it("[case] - updates mutable metadata", () => {
            // Arrange
            const organization = createOrganization();

            // Act
            organization.update({
                patch: { description: "Updated", title: "Updated organization" },
            });

            // Assert
            expect(organization.description).toBe("Updated");
            expect(organization.title).toBe("Updated organization");
            expect(organization.updatedAt).toBeInstanceOf(Date);
        });

        it("[case] - rejects empty and unchanged metadata updates", () => {
            // Arrange
            const organization = createOrganization();

            // Act
            const act = (): unknown => organization.update({ patch: {} });
            const act1 = (): unknown => organization.update({ patch: { title: organization.title } });

            // Assert
            expect(act).toThrow("EMPTY_UPDATE_PATCH");
            expect(act1).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Behavior] - revocation lifecycle", () => {
        it("[case] - revokes and restore organization", () => {
            // Arrange
            const organization = createOrganization();

            // Act
            organization.revoke();
            const result = organization.status;
            const result1 = organization.revokedAt;
            organization.restore();

            // Assert
            expect(result).toBe(OrganizationStatus.REVOKED);
            expect(result1).toBeInstanceOf(Date);
            expect(organization.status).toBe(OrganizationStatus.ACTIVE);
            expect(organization.revokedAt).toBeUndefined();
        });

        it("[case] - rejects restoring an active organization", () => {
            // Arrange
            const organization = createOrganization();

            // Act
            const act = (): unknown => organization.restore();

            // Assert
            expect(act).toThrow("ALREADY_ACTIVE");
        });
        it("[case] - rejects revoking a revoked organization", () => {
            // Arrange
            const organization = createOrganization();
            organization.revoke();

            // Act
            const act = (): unknown => organization.revoke();

            // Assert
            expect(act).toThrow("ALREADY_REVOKED");
        });

        it("[case] - rejects purging an active organization", () => {
            // Arrange
            const organization = createOrganization();

            // Act
            const act = (): unknown => organization.canPurge();

            // Assert
            expect(act).toThrow("CANNOT_PURGE_ACTIVE");
        });
        it("[case] - allows purging a revoked organization", () => {
            // Arrange
            const organization = createOrganization();
            organization.revoke();

            // Act
            const act = (): unknown => organization.canPurge();

            // Assert
            expect(act).not.toThrow();
        });
    });
});
