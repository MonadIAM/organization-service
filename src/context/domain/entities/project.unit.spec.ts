import { describe, expect, it } from "@jest/globals";

import { ProjectStatus } from "~context/enums";

import { ProjectAccountAssignment } from "./project-account-assignment.entity";
import { Organization } from "./organization.entity";
import { Membership } from "./membership.entity";
import { Project } from "./project.entity";

/* eslint-disable prettier/prettier */
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR_ID   = "00000000-0000-4000-8000-000000000002";
const REALM_ID   = "00000000-0000-4000-8000-000000000003";
/* eslint-enable prettier/prettier */

function createProject(): Project {
    const organization = new Organization({
        description: "Description",
        title: "Organization",
        realm: REALM_ID,
    });
    return new Project({
        description: "Description",
        name: "Project",
        organization,
        realm: REALM_ID,
    });
}

function createAssignment(project: Project): ProjectAccountAssignment {
    const membership = new Membership({
        organization: project.organization,
        account: ACCOUNT_ID,
    });
    return new ProjectAccountAssignment({
        assignedBy: ACTOR_ID,
        membership,
        project,
    });
}

describe("[Entity] - Project", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active project without a manager", () => {
            // Arrange

            // Act
            const project = createProject();

            // Assert
            expect(project.status).toBe(ProjectStatus.ACTIVE);
            expect(project.manager).toBeUndefined();
        });
    });

    describe("[Behavior] - manager assignment", () => {
        it("[case] - assigns, replace and unassign a manager", () => {
            // Arrange
            const project = createProject();
            const first = createAssignment(project);
            const second = createAssignment(project);

            // Act
            project.assignManager({ assignment: first });
            project.assignManager({ assignment: second });
            const result = project.manager;
            project.unassignManager();

            // Assert
            expect(result).toBe(second);
            expect(project.manager).toBeUndefined();
        });

        it("[case] - rejects assigning the current manager", () => {
            // Arrange
            const project = createProject();
            const assignment = createAssignment(project);
            project.assignManager({ assignment });

            // Act
            const act = (): unknown => project.assignManager({ assignment });

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
        it("[case] - rejects removing an absent manager", () => {
            // Arrange
            const project = createProject();
            const assignment = createAssignment(project);
            project.assignManager({ assignment });
            project.unassignManager();

            // Act
            const act = (): unknown => project.unassignManager();

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Method] - update", () => {
        it("[case] - updates mutable metadata", () => {
            // Arrange
            const project = createProject();

            // Act
            project.update({
                patch: { description: "Updated", name: "Updated project" },
            });

            // Assert
            expect(project.description).toBe("Updated");
            expect(project.name).toBe("Updated project");
            expect(project.updatedAt).toBeInstanceOf(Date);
        });

        it("[case] - rejects empty and unchanged metadata updates", () => {
            // Arrange
            const project = createProject();

            // Act
            const act = (): unknown => project.update({ patch: {} });
            const act1 = (): unknown => project.update({ patch: { name: project.name } });

            // Assert
            expect(act).toThrow("EMPTY_UPDATE_PATCH");
            expect(act1).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Behavior] - archive lifecycle", () => {
        it("[case] - rejects purging an active project", () => {
            // Arrange
            const project = createProject();

            // Act
            const act = (): unknown => project.canPurge();

            // Assert
            expect(act).toThrow("CANNOT_PURGE_ACTIVE");
        });
        it("[case] - allows purging an archived project", () => {
            // Arrange
            const project = createProject();
            project.archive();

            // Act
            const act = (): unknown => project.canPurge();

            // Assert
            expect(project.status).toBe(ProjectStatus.ARCHIVED);
            expect(project.archivedAt).toBeInstanceOf(Date);
            expect(act).not.toThrow();
        });
        it("[case] - restores an archived project", () => {
            // Arrange
            const project = createProject();

            // Act
            project.archive();
            project.restore();

            // Assert
            expect(project.status).toBe(ProjectStatus.ACTIVE);
            expect(project.archivedAt).toBeUndefined();
        });
    });

    describe("[Method] - beginBootstrap", () => {
        it("[case] - rejects a competing bootstrap without replacing the current process", () => {
            // Arrange
            const project = createProject();
            project.beginBootstrap();
            const process = project.process;

            // Act
            const act = (): unknown => project.beginBootstrap();

            // Assert
            expect(act).toThrow("entities.project.OPERATION_CONFLICT");
            expect(project.process).toBe(process);
            expect(project.status).toBe(ProjectStatus.PROVISIONING);
        });
    });

    describe("[Method] - rejectBootstrap", () => {
        it("[case] - rejects a late bootstrap refusal after activation", () => {
            // Arrange
            const project = createProject();
            project.beginBootstrap();
            project.confirmBootstrap();

            // Act
            const act = (): unknown => project.rejectBootstrap("late rejection");

            // Assert
            expect(act).toThrow("entities.project.OPERATION_CONFLICT");
            expect(project.status).toBe(ProjectStatus.ACTIVE);
        });
    });
});
