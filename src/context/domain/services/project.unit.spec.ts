import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { LockMode } from "@mikro-orm/core";

import { ProjectUnitHelpers } from "~testing/unit/domain-service/project.helpers";
import { ProjectStatus } from "~context/enums";

/* eslint-disable prettier/prettier */
const REALM_ID        = "00000000-0000-4000-8000-100000000001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-100000000002";
const PROJECT_ID      = "00000000-0000-4000-8000-100000000003";
const ASSIGNMENT_ID   = "00000000-0000-4000-8000-100000000004";
/* eslint-enable prettier/prettier */

const helpers = new ProjectUnitHelpers();

describe("[DomainService] - Project", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - create", () => {
        it("[case] - creates a project only in an active organization from the same realm", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
                realm: REALM_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                organizations: [organization],
            });

            // Act
            const result = await service.create({
                input: {
                    organization: ORGANIZATION_ID,
                    realm: REALM_ID,
                    name: "Project",
                    description: "Description",
                },
                transaction: transaction.entityManager,
            });

            // Assert
            expect(repositories.organizations.findUniqueOrThrow).toHaveBeenCalledWith({
                where: { id: ORGANIZATION_ID, realm: REALM_ID, status: "ACTIVE" },
                options: {
                    populate: ["owner"],
                    strategy: "select-in",
                    lockMode: LockMode.PESSIMISTIC_WRITE,
                    refresh: true,
                },
                transaction: transaction.entityManager,
            });
            expect(result.organization).toBe(organization);
            expect(transaction.persist).toHaveBeenCalledWith(result);
        });
    });

    describe("[Method] - changeManager", () => {
        it("[case] - assigns an active project assignment as manager", async () => {
            // Arrange
            const project = helpers.createProject({
                id: PROJECT_ID,
                realm: REALM_ID,
            });
            const assignment = helpers.createProjectAccountAssignment({
                id: ASSIGNMENT_ID,
                project,
            });
            const { service, repositories, transaction } = helpers.service({
                projects: [project],
            });
            repositories.projectAssignments.findUniqueOrThrow.mockImplementation(() => Promise.resolve(assignment));

            // Act
            const result = await service.changeManager({
                id: PROJECT_ID,
                assignment: ASSIGNMENT_ID,
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(result).toBe(project);
            expect(project.manager).toBe(assignment);
        });
    });

    describe("[Behavior] - metadata and manager changes", () => {
        it("[case] - updates project metadata and unassigns its manager", async () => {
            // Arrange
            const project = helpers.createProject({ id: PROJECT_ID, realm: REALM_ID });
            project.assignManager({ assignment: helpers.createProjectAccountAssignment({ project }) });
            const { service, repositories, transaction } = helpers.service({ projects: [project] });

            // Act
            await service.update({
                id: PROJECT_ID,
                patch: { name: "Updated" },
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });
            await service.changeManager({
                assignment: null,
                id: PROJECT_ID,
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(project.name).toBe("Updated");
            expect(project.manager).toBeUndefined();
            expect(repositories.projectAssignments.findUniqueOrThrow).not.toHaveBeenCalled();
        });
    });

    describe("[Behavior] - archive lifecycle", () => {
        it("[case] - deduplicates archive identifiers and rejects incomplete results", async () => {
            // Arrange
            const project = helpers.createProject({
                id: PROJECT_ID,
                realm: REALM_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                projects: [project],
            });

            // Act
            const result = await service.archive({
                identifiers: [PROJECT_ID, PROJECT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });
            const calls = repositories.projects.find.mock.calls.slice();
            repositories.projects.find.mockImplementation(() => Promise.resolve([]));
            const result1 = service.restore({
                identifiers: [PROJECT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(result).toEqual([project]);
            expect(calls).toContainEqual([
                {
                    where: { id: { $in: [PROJECT_ID] }, $or: [{ realm: REALM_ID }, { organization: { realm: REALM_ID } }] },
                    transaction: transaction.entityManager,
                },
            ]);
            await expect(result1).rejects.toThrow("services.project.PROJECTS_NOT_FOUND");
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - purges archived projects", async () => {
            // Arrange
            const project = helpers.createProject({
                id: PROJECT_ID,
                realm: REALM_ID,
                status: ProjectStatus.ARCHIVED,
            });
            const { service, transaction } = helpers.service({
                projects: [project],
            });

            // Act
            await service.purge({
                identifiers: [PROJECT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(transaction.remove).toHaveBeenCalledWith(project);
        });
    });
});
