import { describe, expect, it } from "@jest/globals";
import { isUUID } from "class-validator";

import { AssignmentStatus } from "~context/enums";

import { ProjectAccountAssignment } from "./project-account-assignment.entity";
import { Organization } from "./organization.entity";
import { Membership } from "./membership.entity";
import { Project } from "./project.entity";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const REALM_ID = "00000000-0000-4000-8000-000000000003";

function createAssignment(): ProjectAccountAssignment {
    const organization = new Organization({
        description: "Description",
        realm: REALM_ID,
        title: "Organization",
    });
    const membership = new Membership({ account: ACCOUNT_ID, organization });
    const project = new Project({
        description: "Description",
        name: "Project",
        organization,
        realm: REALM_ID,
    });
    return new ProjectAccountAssignment({
        assignedBy: ACTOR_ID,
        membership,
        project,
    });
}

describe("[Entity] - ProjectAccountAssignment", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active immutable assignment", () => {
            // Arrange

            // Act
            const assignment = createAssignment();
            const result = isUUID(assignment.id, "4");

            // Assert
            expect(result).toBe(true);
            expect(assignment.status).toBe(AssignmentStatus.ACTIVE);
            expect(assignment.organization).toBe(assignment.project.organization);
            expect(assignment.assignedAt).toBeInstanceOf(Date);
        });
    });

    describe("[Behavior] - revocation lifecycle", () => {
        it("[case] - allows purging a revoked assignment", () => {
            // Arrange
            const assignment = createAssignment();
            assignment.revoke();

            // Act
            const act = (): unknown => assignment.canPurge();

            // Assert
            expect(assignment.status).toBe(AssignmentStatus.REVOKED);
            expect(act).not.toThrow();
        });
        it("[case] - restores a revoked assignment", () => {
            // Arrange
            const assignment = createAssignment();

            // Act
            assignment.revoke();
            assignment.restore();

            // Assert
            expect(assignment.status).toBe(AssignmentStatus.ACTIVE);
        });

        it("[case] - rejects restoring an active assignment", () => {
            // Arrange
            const assignment = createAssignment();

            // Act
            const act = (): unknown => assignment.restore();

            // Assert
            expect(act).toThrow("ALREADY_ACTIVE");
        });
        it("[case] - rejects purging an active assignment", () => {
            // Arrange
            const assignment = createAssignment();

            // Act
            const act = (): unknown => assignment.canPurge();

            // Assert
            expect(act).toThrow("CANNOT_PURGE_ACTIVE");
        });
        it("[case] - rejects revoking a revoked assignment", () => {
            // Arrange
            const assignment = createAssignment();
            assignment.revoke();

            // Act
            const act = (): unknown => assignment.revoke();

            // Assert
            expect(act).toThrow("ALREADY_REVOKED");
        });
    });
});
