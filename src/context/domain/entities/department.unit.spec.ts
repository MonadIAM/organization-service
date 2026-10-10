import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { DepartmentStatus } from "~context/enums";

import { Organization } from "./organization.entity";
import { Department } from "./department.entity";

const REALM_ID = "00000000-0000-4000-8000-000000000003";

function createDepartment(): Department {
    const organization = new Organization({
        description: "Description",
        realm: REALM_ID,
        title: "Organization",
    });
    return new Department({
        description: "Description",
        name: "Department",
        organization,
    });
}

describe("[Entity] - Department", () => {
    describe("[Method] - constructor", () => {
        it("[case] - initializes an active department without a managerPosition", () => {
            // Arrange

            // Act
            const department = createDepartment();

            // Assert
            expect(department.status).toBe(DepartmentStatus.ACTIVE);
            expect(department.managerPosition).toBeUndefined();
        });
    });

    describe("[Behavior] - manager assignment", () => {
        it("[case] - assigns, replace and unassign a managerPosition", () => {
            // Arrange
            const department = createDepartment();
            const first = randomUUID();
            const second = randomUUID();

            // Act
            department.assignManager({ position: first });
            department.completePosition(false);
            department.assignManager({ position: second });
            const result = department.managerPosition;
            department.unassignManager();

            // Assert
            expect(result).toBe(second);
            expect(department.managerPosition).toBeUndefined();
        });

        it("[case] - rejects assigning the current managerPosition", () => {
            // Arrange
            const department = createDepartment();
            const position = randomUUID();
            department.assignManager({ position });
            department.completePosition(false);

            // Act
            const act = (): unknown => department.assignManager({ position });

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
        it("[case] - rejects removing an absent managerPosition", () => {
            // Arrange
            const department = createDepartment();
            const position = randomUUID();
            department.assignManager({ position });
            department.completePosition(false);
            department.unassignManager();

            // Act
            const act = (): unknown => department.unassignManager();

            // Assert
            expect(act).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Method] - update", () => {
        it("[case] - updates mutable metadata", () => {
            // Arrange
            const department = createDepartment();

            // Act
            department.update({
                patch: { description: "Updated", name: "Updated department" },
            });

            // Assert
            expect(department.description).toBe("Updated");
            expect(department.name).toBe("Updated department");
        });

        it("[case] - rejects empty and unchanged metadata updates", () => {
            // Arrange
            const department = createDepartment();

            // Act
            const act = (): unknown => department.update({ patch: {} });
            const act1 = (): unknown => department.update({ patch: { name: department.name } });

            // Assert
            expect(act).toThrow("EMPTY_UPDATE_PATCH");
            expect(act1).toThrow("NO_CHANGES_DETECTED");
        });
    });

    describe("[Behavior] - archive lifecycle", () => {
        it("[case] - rejects purging an active department", () => {
            // Arrange
            const department = createDepartment();

            // Act
            const act = (): unknown => department.canPurge();

            // Assert
            expect(act).toThrow("CANNOT_PURGE_ACTIVE");
        });
        it("[case] - allows purging an archived department", () => {
            // Arrange
            const department = createDepartment();
            department.archive();

            // Act
            const act = (): unknown => department.canPurge();

            // Assert
            expect(act).not.toThrow();
        });
        it("[case] - restores an archived department", () => {
            // Arrange
            const department = createDepartment();

            // Act
            department.archive();
            department.restore();

            // Assert
            expect(department.status).toBe(DepartmentStatus.ACTIVE);
            expect(department.archivedAt).toBeUndefined();
        });
    });
});
