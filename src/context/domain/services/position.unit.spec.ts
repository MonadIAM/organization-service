import { describe, expect, it } from "@jest/globals";
import { LockMode } from "@mikro-orm/core";

import { DepartmentStatus, TeamStatus, PositionReferenceType } from "~context/enums";
import { PositionUnitHelpers } from "~testing/unit/domain-service/position.helpers";
import { Exception } from "~common/exceptions";

const REQUEST: Topics.Position.PlacementRequestedMessage["payload"] = {
    actor: "actor-account",
    realm: "organization-realm",
    input: {
        organization: "organization-a",
        process: "placement-process",
        department: "department-a",
        position: "position-a",
        team: "team-a",
    },
};
const PREVIOUS_POSITION = "previous-position";
const helpers = new PositionUnitHelpers();

describe("[DomainService] - Position", () => {
    describe("[Method] - validatePlacement", () => {
        it("[case] - checks active placement targets in the requested organization and realm with read locks", async () => {
            // Arrange
            const { service, repositories, transaction } = helpers.service();

            // Act
            await service.validatePlacement({ ...REQUEST, transaction: transaction.entityManager });

            // Assert
            expect(repositories.departments.findUniqueOrThrow).toHaveBeenCalledWith({
                where: {
                    organization: { id: REQUEST.input.organization, realm: REQUEST.realm },
                    status: DepartmentStatus.ACTIVE,
                    id: REQUEST.input.department,
                },
                options: { lockMode: LockMode.PESSIMISTIC_READ },
                transaction: transaction.entityManager,
            });
            expect(repositories.teams.findUniqueOrThrow).toHaveBeenCalledWith({
                where: {
                    organization: REQUEST.input.organization,
                    department: REQUEST.input.department,
                    status: TeamStatus.ACTIVE,
                    id: REQUEST.input.team,
                },
                options: { lockMode: LockMode.PESSIMISTIC_READ },
                transaction: transaction.entityManager,
            });
        });

        it.each(["departments", "teams"] as const)("[case] - propagates the %s lookup failure", async (target) => {
            // Arrange
            const { service, repositories, transaction } = helpers.service();
            const error = Exception.notFound({ messageKey: "placement not found" });
            repositories[target].findUniqueOrThrow.mockImplementation(() => Promise.reject(error));

            // Act
            const result = service.validatePlacement({ ...REQUEST, transaction: transaction.entityManager });

            // Assert
            await expect(result).rejects.toBe(error);
        });
    });

    describe("[Method] - completeReference", () => {
        it.each([
            { rejected: false, expected: REQUEST.input.position },
            { rejected: true, expected: PREVIOUS_POSITION },
        ])("[case] - completes a department manager reference with rejected=$rejected", async ({ rejected, expected }) => {
            // Arrange
            const department = helpers.createDepartment({
                managerPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const { service, repositories, transaction } = helpers.service({ departments: [department] });
            repositories.departments.findUnique.mockImplementation(() => Promise.resolve(department));

            // Act
            await service.completeReference({
                ...REQUEST,
                input: {
                    type: PositionReferenceType.DEPARTMENT_MANAGER,
                    organization: REQUEST.input.organization,
                    department: REQUEST.input.department,
                    position: REQUEST.input.position,
                    process: REQUEST.input.process,
                },
                transaction: transaction.entityManager,
                rejected,
            });

            // Assert
            expect(repositories.departments.findUnique).toHaveBeenCalledWith({
                where: {
                    id: REQUEST.input.department,
                    organization: REQUEST.input.organization,
                    process: REQUEST.input.process,
                },
                options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                transaction: transaction.entityManager,
            });
            expect(repositories.teams.findUnique).not.toHaveBeenCalled();
            expect(department.managerPosition).toBe(expected);
            expect(department.previousPosition).toBeUndefined();
            expect(department.process).toBeUndefined();
        });

        it.each([
            { rejected: false, expected: REQUEST.input.position },
            { rejected: true, expected: PREVIOUS_POSITION },
        ])("[case] - completes a team lead reference with rejected=$rejected", async ({ rejected, expected }) => {
            // Arrange
            const team = helpers.createTeam({
                leadPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const { service, repositories, transaction } = helpers.service({ teams: [team] });
            repositories.teams.findUnique.mockImplementation(() => Promise.resolve(team));

            // Act
            await service.completeReference({
                ...REQUEST,
                input: { ...REQUEST.input, type: PositionReferenceType.TEAM_LEAD },
                transaction: transaction.entityManager,
                rejected,
            });

            // Assert
            expect(repositories.teams.findUnique).toHaveBeenCalledWith({
                where: {
                    id: REQUEST.input.team,
                    organization: REQUEST.input.organization,
                    process: REQUEST.input.process,
                },
                options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                transaction: transaction.entityManager,
            });
            expect(repositories.departments.findUnique).not.toHaveBeenCalled();
            expect(team.leadPosition).toBe(expected);
            expect(team.previousPosition).toBeUndefined();
            expect(team.process).toBeUndefined();
        });

        it.each([PositionReferenceType.DEPARTMENT_MANAGER, PositionReferenceType.TEAM_LEAD])(
            "[case] - ignores a missing target or an already completed process for %s",
            async (type) => {
                // Arrange
                const { service, repositories, transaction } = helpers.service();
                const repository =
                    type === PositionReferenceType.DEPARTMENT_MANAGER ? repositories.departments : repositories.teams;
                const id =
                    type === PositionReferenceType.DEPARTMENT_MANAGER ? REQUEST.input.department : REQUEST.input.team;

                // Act
                const result = service.completeReference({
                    ...REQUEST,
                    input: { ...REQUEST.input, type },
                    transaction: transaction.entityManager,
                    rejected: true,
                });
                const result1 = await result;

                // Assert
                expect(result1).toBeUndefined();
                expect(repository.findUnique).toHaveBeenCalledWith({
                    where: {
                        id,
                        organization: REQUEST.input.organization,
                        process: REQUEST.input.process,
                    },
                    options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                    transaction: transaction.entityManager,
                });
            },
        );
    });

    describe("[Method] - release", () => {
        it("[case] - removes matching manager and lead references with organization-scoped write locks", async () => {
            // Arrange
            const departments = [
                helpers.createDepartment({ managerPosition: REQUEST.input.position }),
                helpers.createDepartment({ managerPosition: PREVIOUS_POSITION }),
            ];
            const teams = [
                helpers.createTeam({ leadPosition: REQUEST.input.position }),
                helpers.createTeam({ leadPosition: PREVIOUS_POSITION }),
            ];
            const positions = [REQUEST.input.position, PREVIOUS_POSITION];
            const { service, repositories, transaction } = helpers.service({ departments, teams });

            // Act
            await service.release({
                ...REQUEST,
                input: { organization: REQUEST.input.organization, positions },
                transaction: transaction.entityManager,
            });
            const calls = repositories.departments.find.mock.calls.slice();
            const calls1 = repositories.teams.find.mock.calls.slice();
            const result = departments.map((department) => department.managerPosition);
            const result3 = teams.map((team) => team.leadPosition);

            // Assert
            expect(calls).toContainEqual([
                {
                    where: {
                        organization: REQUEST.input.organization,
                        $or: [{ managerPosition: { $in: positions } }, { previousPosition: { $in: positions } }],
                    },
                    options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                    transaction: transaction.entityManager,
                },
            ]);
            expect(calls1).toContainEqual([
                {
                    where: {
                        organization: REQUEST.input.organization,
                        $or: [{ leadPosition: { $in: positions } }, { previousPosition: { $in: positions } }],
                    },
                    options: { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
                    transaction: transaction.entityManager,
                },
            ]);
            expect(result).toEqual([undefined, undefined]);
            expect(result3).toEqual([undefined, undefined]);
        });

        it("[case] - clears rollback references while preserving current references and pending processes", async () => {
            // Arrange
            const department = helpers.createDepartment({
                managerPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const team = helpers.createTeam({
                leadPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const { service, transaction } = helpers.service({ departments: [department], teams: [team] });

            // Act
            await service.release({
                ...REQUEST,
                input: { organization: REQUEST.input.organization, positions: [PREVIOUS_POSITION] },
                transaction: transaction.entityManager,
            });

            // Assert
            expect(department.previousPosition).toBeUndefined();
            expect(team.previousPosition).toBeUndefined();
            expect(department.managerPosition).toBe(REQUEST.input.position);
            expect(team.leadPosition).toBe(REQUEST.input.position);
            expect(department.process).toBe(REQUEST.input.process);
            expect(team.process).toBe(REQUEST.input.process);
        });

        it("[case] - leaves pending current references for their correlated completion", async () => {
            // Arrange
            const department = helpers.createDepartment({
                managerPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const team = helpers.createTeam({
                leadPosition: REQUEST.input.position,
                previousPosition: PREVIOUS_POSITION,
                process: REQUEST.input.process,
            });
            const { service, transaction } = helpers.service({ departments: [department], teams: [team] });

            // Act
            await service.release({
                ...REQUEST,
                input: { organization: REQUEST.input.organization, positions: [REQUEST.input.position] },
                transaction: transaction.entityManager,
            });

            // Assert
            expect(department.managerPosition).toBe(REQUEST.input.position);
            expect(team.leadPosition).toBe(REQUEST.input.position);
            expect(department.previousPosition).toBe(PREVIOUS_POSITION);
            expect(team.previousPosition).toBe(PREVIOUS_POSITION);
            expect(department.process).toBe(REQUEST.input.process);
            expect(team.process).toBe(REQUEST.input.process);
        });

        it("[case] - accepts positions with no manager or lead references", async () => {
            // Arrange
            const { service, transaction } = helpers.service({ departments: [], teams: [] });

            // Act
            const result = service.release({
                ...REQUEST,
                input: { organization: REQUEST.input.organization, positions: [REQUEST.input.position] },
                transaction: transaction.entityManager,
            });
            const result1 = await result;

            // Assert
            expect(result1).toBeUndefined();
        });

        it.each(["departments", "teams"] as const)(
            "[case] - propagates a %s lookup failure without changing either reference",
            async (target) => {
                // Arrange
                const department = helpers.createDepartment({ managerPosition: REQUEST.input.position });
                const team = helpers.createTeam({ leadPosition: REQUEST.input.position });
                const { service, repositories, transaction } = helpers.service({
                    departments: [department],
                    teams: [team],
                });
                const error = new Error("lookup failed");
                repositories[target].find.mockImplementation(() => Promise.reject(error));

                // Act
                const result = service.release({
                    ...REQUEST,
                    input: { organization: REQUEST.input.organization, positions: [REQUEST.input.position] },
                    transaction: transaction.entityManager,
                });

                // Assert
                await expect(result).rejects.toBe(error);
                expect(department.managerPosition).toBe(REQUEST.input.position);
                expect(team.leadPosition).toBe(REQUEST.input.position);
            },
        );
    });
});
