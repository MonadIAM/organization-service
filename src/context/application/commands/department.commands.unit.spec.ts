import { describe, expect, it } from "@jest/globals";

import { DepartmentCommandsUnitHelpers } from "~testing/unit/command-services/department.helpers";
import { KafkaTopic, PositionTopicAction, MoveMode } from "~context/enums";

import { DepartmentMapper } from "../mappers/department.mapper";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ORGANIZATION = "organization-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const helpers = new DepartmentCommandsUnitHelpers();

describe("[Commands] - Department", () => {
    describe("[Method] - create", () => {
        it("[case] - creates in a transaction with the required ownership scope", async () => {
            // Arrange
            const { commands, departmentService, transaction, run } = helpers.commands();
            const input = { name: "New entity", description: "Description" };
            const created = helpers.createDepartment();
            departmentService.create.mockResolvedValue(created);

            // Act
            await commands.create({
                input,
                actor: ACTOR,
                context: CONTEXT,
                realm: REALM,
                organization: ORGANIZATION,
            });

            // Assert
            expect(departmentService.create.mock.calls).toEqual([
                [{ input, transaction: transaction.entityManager, realm: REALM, organization: ORGANIZATION }],
            ]);
            expect(run.mock.calls).toEqual([
                [expect.objectContaining({ changeLog: true, audit: expect.objectContaining({ actor: ACTOR, input }) })],
            ]);
        });
    });

    describe("[Behavior] - archive lifecycle", () => {
        it.each([
            { method: "archive", count: 1 },
            { method: "archive", count: 2 },
            { method: "restore", count: 2 },
        ] as const)(
            "[case] - $method preserves organization scope and reports $count changed entities",
            async ({ method, count }) => {
                // Arrange
                const { commands, departmentService, transaction, run } = helpers.commands();
                const entities = Array.from({ length: count }, () => helpers.createDepartment());
                const input = { identifiers: [ID, "another-id", "unchanged-id"], reason: "Requested change" };
                departmentService[method].mockResolvedValue(entities);

                // Act
                const result = await commands[method]({
                    input,
                    actor: ACTOR,
                    realm: REALM,
                    organization: ORGANIZATION,
                    context: CONTEXT,
                });

                // Assert
                expect(departmentService[method].mock.calls).toEqual([
                    [
                        {
                            identifiers: input.identifiers,
                            realm: REALM,
                            organization: ORGANIZATION,
                            transaction: transaction.entityManager,
                        },
                    ],
                ]);
                expect(result.params).toEqual(count > 1 ? { count } : undefined);
                expect(run).toHaveBeenCalledTimes(1);
            },
        );
    });

    describe("[Method] - update", () => {
        it("[case] - updates only the patch within the requested organization", async () => {
            // Arrange
            const { commands, departmentService, transaction } = helpers.commands();
            const input = { patch: { name: "Renamed" }, reason: "Correction" };

            // Act
            await commands.update({
                input,
                id: ID,
                realm: REALM,
                organization: ORGANIZATION,
                actor: ACTOR,
                context: CONTEXT,
            });

            // Assert
            expect(departmentService.update.mock.calls).toEqual([
                [
                    {
                        patch: input.patch,
                        id: ID,
                        realm: REALM,
                        organization: ORGANIZATION,
                        transaction: transaction.entityManager,
                    },
                ],
            ]);
        });
    });

    describe("[Method] - changeManager", () => {
        it.each([ID, null])("[case] - changes the responsible position to %s within the organization", async (position) => {
            // Arrange
            const { commands, departmentService, transaction, run } = helpers.commands();
            const department = helpers.createDepartment();
            departmentService.changeManager.mockResolvedValue(department);

            // Act
            await commands.changeManager({
                input: { position, reason: "Rotation" },
                id: ID,
                realm: REALM,
                organization: ORGANIZATION,
                actor: ACTOR,
                context: CONTEXT,
            });
            const result = departmentService.changeManager.mock.calls;
            const calls2 = run.mock.calls.slice();
            const result3 = await run.mock.results[0].value;

            // Assert
            expect(result).toEqual([
                [{ position, id: ID, realm: REALM, organization: ORGANIZATION, transaction: transaction.entityManager }],
            ]);
            expect(calls2).toContainEqual([
                expect.objectContaining({
                    outbox: {
                        payloadMapper: DepartmentMapper.prototype.referencePayload,
                        destinationTopic: KafkaTopic.POSITION,
                        actionType: PositionTopicAction.REFERENCE_REQUESTED,
                    },
                }),
            ]);
            expect(result3).toEqual({ department, actor: ACTOR, realm: REALM });
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - purges one department and schedules its HR cleanup in the deletion transaction", async () => {
            // Arrange
            const { commands, departmentService, transaction, run } = helpers.commands();
            const department = helpers.createDepartment();
            const input = { reason: "Cleanup" };
            departmentService.purge.mockResolvedValue(department);

            // Act
            const result = await commands.purge({
                input,
                id: department.id,
                actor: ACTOR,
                realm: REALM,
                organization: ORGANIZATION,
                context: CONTEXT,
            });
            const result4 = departmentService.purge.mock.calls;
            const calls5 = run.mock.calls.slice();
            const calls6 = run.mock.calls.slice();
            const result7 = await run.mock.results[0].value;

            // Assert
            expect(result).toEqual({ message: "commands.department.PURGED" });
            expect(result4).toEqual([
                [{ id: department.id, organization: ORGANIZATION, realm: REALM, transaction: transaction.entityManager }],
            ]);
            expect(calls5).toHaveLength(1);
            expect(calls6).toContainEqual([
                expect.objectContaining({
                    changeLog: true,
                    outbox: {
                        payloadMapper: DepartmentMapper.prototype.purgePayload,
                        actionType: PositionTopicAction.DEPARTMENT_PURGED,
                        destinationTopic: KafkaTopic.POSITION,
                    },
                }),
            ]);
            expect(result7).toEqual({
                departments: [department],
                actor: ACTOR,
                realm: REALM,
            });
        });
    });

    describe("[Method] - archive", () => {
        it("[case] - propagates a domain failure through the transaction", async () => {
            // Arrange
            const { commands, departmentService } = helpers.commands();
            const failure = new Error("domain rejected mutation");
            departmentService.archive.mockRejectedValue(failure);

            // Act
            const result = commands.archive({
                input: { identifiers: [ID], reason: "Requested change" },
                actor: ACTOR,
                realm: REALM,
                organization: ORGANIZATION,
                context: CONTEXT,
            });

            // Assert
            await expect(result).rejects.toBe(failure);
        });
    });

    describe("[Method] - move", () => {
        it.each([MoveMode.SUBTREE, MoveMode.PARALLEL])(
            "[case] - audits %s restructuring without changing HR placement",
            async (mode) => {
                // Arrange
                const { commands, departmentService, transaction, run } = helpers.commands();
                const input = { target: ID, targetParent: null, mode, reason: "Reorganization" };
                departmentService.move.mockResolvedValue(undefined);

                // Act
                await commands.move({
                    input,
                    actor: ACTOR,
                    realm: REALM,
                    organization: ORGANIZATION,
                    context: CONTEXT,
                });

                // Assert
                expect(departmentService.move).toHaveBeenCalledWith({
                    ...input,
                    realm: REALM,
                    organization: ORGANIZATION,
                    transaction: transaction.entityManager,
                });
                expect(run).toHaveBeenCalledWith(
                    expect.objectContaining({ changeLog: true, audit: expect.objectContaining({ actor: ACTOR, input }) }),
                );
                expect(run.mock.calls[0][0].outbox).toBeUndefined();
            },
        );
    });
});
