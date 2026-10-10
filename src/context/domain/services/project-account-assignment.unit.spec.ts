import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { ProjectAccountAssignmentUnitHelpers } from "~testing/unit/domain-service/project-account-assignment.helpers";
import { AssignmentStatus } from "~context/enums";

/* eslint-disable prettier/prettier */
const REALM_ID      = "00000000-0000-4000-8000-100000000001";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-100000000002";
const PROJECT_ID    = "00000000-0000-4000-8000-100000000003";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-100000000004";
const ACTOR_ID      = "00000000-0000-4000-8000-100000000005";
/* eslint-enable prettier/prettier */

const helpers = new ProjectAccountAssignmentUnitHelpers();

describe("[DomainService] - ProjectAccountAssignment", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - create", () => {
        it("[case] - creates an assignment for an active membership and project in the same organization", async () => {
            // Arrange
            const organization = helpers.createOrganization({ realm: REALM_ID });
            const membership = helpers.createMembership({
                id: MEMBERSHIP_ID,
                organization,
            });
            const project = helpers.createProject({
                id: PROJECT_ID,
                organization,
                realm: REALM_ID,
            });
            const { service, transaction } = helpers.service({
                memberships: [membership],
                projects: [project],
            });

            // Act
            const result = await service.create({
                input: { membership: MEMBERSHIP_ID, project: PROJECT_ID },
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
                realm: REALM_ID,
            });

            // Assert
            expect(result).toEqual(
                expect.objectContaining({
                    membership,
                    project,
                    assignedBy: ACTOR_ID,
                }),
            );
            expect(transaction.persist).toHaveBeenCalledWith(result);
        });

        it("[case] - rejects assignments across organizations", async () => {
            // Arrange
            const membership = helpers.createMembership({ id: MEMBERSHIP_ID });
            const project = helpers.createProject({
                id: PROJECT_ID,
                organization: helpers.createOrganization(),
            });
            const { service, transaction } = helpers.service({
                memberships: [membership],
                projects: [project],
            });

            // Act
            const result = service.create({
                input: { membership: MEMBERSHIP_ID, project: PROJECT_ID },
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
                realm: REALM_ID,
            });

            // Assert
            await expect(result).rejects.toThrow("services.project-account-assignment.ORGANIZATION_MISMATCH");
            expect(transaction.persist).not.toHaveBeenCalled();
        });
    });

    describe("[Behavior] - revocation lifecycle", () => {
        it("[case] - deduplicates bulk identifiers and rejects incomplete results", async () => {
            // Arrange
            const assignment = helpers.createProjectAccountAssignment({
                id: ASSIGNMENT_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                projectAssignments: [assignment],
            });

            // Act
            const result = await service.revoke({
                identifiers: [ASSIGNMENT_ID, ASSIGNMENT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });
            const calls = repositories.projectAssignments.find.mock.calls.slice();
            repositories.projectAssignments.find.mockImplementation(() => Promise.resolve([]));
            const result1 = service.restore({
                identifiers: [ASSIGNMENT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(result).toEqual([assignment]);
            expect(calls).toContainEqual([
                {
                    where: {
                        id: { $in: [ASSIGNMENT_ID] },
                        $or: [{ organization: { realm: REALM_ID } }, { project: { realm: REALM_ID } }],
                    },
                    transaction: transaction.entityManager,
                },
            ]);
            await expect(result1).rejects.toThrow("services.project-account-assignment.ASSIGNMENTS_NOT_FOUND");
        });
    });

    describe("[Behavior] - assignment cleanup", () => {
        it("[case] - purges revoked assignments and clean removes all assignments for memberships", async () => {
            // Arrange
            const assignment = helpers.createProjectAccountAssignment({
                id: ASSIGNMENT_ID,
                status: AssignmentStatus.REVOKED,
            });
            const { service, repositories, transaction } = helpers.service({
                projectAssignments: [assignment],
            });

            // Act
            await service.purge({
                identifiers: [ASSIGNMENT_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });
            const calls = transaction.remove.mock.calls.slice();
            transaction.remove.mockClear();
            const result = await service.clean({
                memberships: [MEMBERSHIP_ID],
                transaction: transaction.entityManager,
            });

            // Assert
            expect(calls).toContainEqual([assignment]);
            expect(result).toEqual([assignment]);
            expect(repositories.projectAssignments.find).toHaveBeenLastCalledWith({
                where: { membership: { id: { $in: [MEMBERSHIP_ID] } } },
                transaction: transaction.entityManager,
            });
            expect(transaction.remove).toHaveBeenCalledWith(assignment);
        });
    });
});
