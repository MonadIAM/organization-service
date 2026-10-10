import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { TeamStatus } from "~context/enums";

import { Organization } from "./organization.entity";
import { Department } from "./department.entity";
import { Team } from "./team.entity";

const REALM_ID = "00000000-0000-4000-8000-000000000003";

function createTeam(): Team {
    const organization = new Organization({
        description: "Description",
        title: "Organization",
        realm: REALM_ID,
    });
    const department = new Department({
        description: "Description",
        name: "Department",
        organization,
    });
    return new Team({
        description: "Description",
        name: "Team",
        organization,
        department,
    });
}

describe("[Entity] - Team", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active team without a leadPosition", () => {
            // Arrange

            // Act
            const team = createTeam();

            // Assert
            expect(team.status).toBe(TeamStatus.ACTIVE);
            expect(team.leadPosition).toBeUndefined();
        });
    });

    describe("[Behavior] - lead assignment", () => {
        it("[case] - assigns, replace and unassign a leadPosition", () => {
            // Arrange
            const team = createTeam();
            const first = randomUUID();
            const second = randomUUID();

            // Act
            team.assignLead({ position: first });
            team.completePosition(false);
            team.assignLead({ position: second });
            const result = team.leadPosition;
            team.unassignLead();

            // Assert
            expect(result).toBe(second);
            expect(team.leadPosition).toBeUndefined();
        });

        it("[case] - rejects assigning the current leadPosition", () => {
            // Arrange
            const team = createTeam();
            const position = randomUUID();
            team.assignLead({ position });
            team.completePosition(false);

            // Act
            const act = (): unknown => team.assignLead({ position });

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
        it("[case] - rejects removing an absent leadPosition", () => {
            // Arrange
            const team = createTeam();
            const position = randomUUID();
            team.assignLead({ position });
            team.completePosition(false);
            team.unassignLead();

            // Act
            const act = (): unknown => team.unassignLead();

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Method] - update", () => {
        it("[case] - updates mutable metadata", () => {
            // Arrange
            const team = createTeam();

            // Act
            team.update({
                patch: { description: "Updated", name: "Updated team" },
            });

            // Assert
            expect(team.description).toBe("Updated");
            expect(team.name).toBe("Updated team");
        });

        it("[case] - rejects empty and unchanged metadata updates", () => {
            // Arrange
            const team = createTeam();

            // Act
            const act = (): unknown => team.update({ patch: {} });
            const act1 = (): unknown => team.update({ patch: { name: team.name } });

            // Assert
            expect(act).toThrow("EMPTY_UPDATE_PATCH");
            expect(act1).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Behavior] - archive lifecycle", () => {
        it("[case] - rejects purging an active team", () => {
            // Arrange
            const team = createTeam();

            // Act
            const act = (): unknown => team.canPurge();

            // Assert
            expect(act).toThrow("CANNOT_PURGE_ACTIVE");
        });
        it("[case] - allows purging an archived team", () => {
            // Arrange
            const team = createTeam();
            team.archive();

            // Act
            const act = (): unknown => team.canPurge();

            // Assert
            expect(act).not.toThrow();
        });
        it("[case] - restores an archived team", () => {
            // Arrange
            const team = createTeam();

            // Act
            team.archive();
            team.restore();

            // Assert
            expect(team.status).toBe(TeamStatus.ACTIVE);
            expect(team.archivedAt).toBeUndefined();
        });
    });
});
