import { describe, expect, it } from "@jest/globals";

import { ProjectCommandsUnitHelpers } from "~testing/unit/command-services/project.helpers";
import { KafkaTopic, RealmTopicAction, RealmType } from "~context/enums";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const INCOMING: TransactionManager.Service.IncomingMessage = { consumerKey: "unit-consumer", event: "incoming-event" };
const helpers = new ProjectCommandsUnitHelpers();

describe("[Commands] - Project", () => {
    describe("[Method] - create", () => {
        it("[case] - creates in a transaction with the required ownership scope", async () => {
            // Arrange
            const { commands, projectService, transaction, run } = helpers.commands();
            const input = { organization: "parent-id", name: "New entity", description: "Description", realm: REALM };
            const created = helpers.createProject();
            projectService.create.mockResolvedValue(created);

            // Act
            await commands.create({ input, actor: ACTOR, context: CONTEXT });

            // Assert
            expect(projectService.create.mock.calls).toEqual([[{ input, transaction: transaction.entityManager }]]);
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
            { method: "purge", count: 2 },
        ] as const)(
            "[case] - $method preserves realm scope and reports $count changed entities",
            async ({ method, count }) => {
                // Arrange
                const { commands, projectService, transaction, run } = helpers.commands();
                const entities = Array.from({ length: count }, () => helpers.createProject());
                const input = { identifiers: [ID, "another-id", "unchanged-id"], reason: "Requested change" };
                projectService[method].mockResolvedValue(entities);

                // Act
                const result = await commands[method]({ input, actor: ACTOR, realm: REALM, context: CONTEXT });
                const result2 = projectService[method].mock.calls;
                const result4 = result.params;
                const calls5 = run.mock.calls.slice();
                const result6 = await run.mock.results[0]?.value;

                // Assert
                expect(result2).toEqual([
                    [{ identifiers: input.identifiers, realm: REALM, transaction: transaction.entityManager }],
                ]);
                expect(result4).toEqual(count > 1 ? { count } : undefined);
                expect(calls5).toHaveLength(1);
                expect(result6).toEqual({ ...{ projects: entities }, actor: ACTOR });
                expect(run.mock.calls).toEqual([
                    [
                        expect.objectContaining({
                            outbox: expect.objectContaining({
                                destinationTopic: KafkaTopic.REALM,
                                actionType:
                                    method === "restore"
                                        ? RealmTopicAction.SYSTEM_RESTORE
                                        : method === "purge"
                                          ? RealmTopicAction.SYSTEM_PURGE
                                          : RealmTopicAction.SYSTEM_REVOKE,
                            }),
                        }),
                    ],
                ]);
            },
        );
    });

    describe("[Method] - update", () => {
        it("[case] - updates only the patch within the requested realm", async () => {
            // Arrange
            const { commands, projectService, transaction } = helpers.commands();
            const input = { patch: { name: "Renamed" }, reason: "Correction" };

            // Act
            await commands.update({ input, id: ID, realm: REALM, actor: ACTOR, context: CONTEXT });

            // Assert
            expect(projectService.update.mock.calls).toEqual([
                [{ patch: input.patch, id: ID, realm: REALM, transaction: transaction.entityManager }],
            ]);
        });
    });

    describe("[Method] - changeManager", () => {
        it.each([ID, null])("[case] - changes the responsible assignment to %s within the realm", async (assignment) => {
            // Arrange
            const { commands, projectService, transaction } = helpers.commands();

            // Act
            await commands.changeManager({
                input: { assignment, reason: "Rotation" },
                id: ID,
                realm: REALM,
                actor: ACTOR,
                context: CONTEXT,
            });

            // Assert
            expect(projectService.changeManager.mock.calls).toEqual([
                [{ assignment, id: ID, realm: REALM, transaction: transaction.entityManager }],
            ]);
        });
    });

    describe("[Method] - archive", () => {
        it("[case] - propagates a domain failure through the transaction", async () => {
            // Arrange
            const { commands, projectService } = helpers.commands();
            const failure = new Error("domain rejected mutation");
            projectService.archive.mockRejectedValue(failure);

            // Act
            const result = commands.archive({
                input: { identifiers: [ID], reason: "Requested change" },
                actor: ACTOR,
                realm: REALM,
                context: CONTEXT,
            });

            // Assert
            await expect(result).rejects.toBe(failure);
        });
    });

    describe("[Method] - confirmBootstrap", () => {
        it("[case] - consumes confirmBootstrap with the original process and transaction", async () => {
            // Arrange
            const { commands, projectService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: { type: RealmType.PROJECT as const, resource: ID, process: "process-id", reason: "Rejected" },
            };
            projectService.confirmBootstrap.mockResolvedValue({ realms: [] });

            // Act
            await commands.confirmBootstrap({ ...request, incoming: INCOMING });

            // Assert
            expect(projectService.confirmBootstrap.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });

    describe("[Method] - rejectBootstrap", () => {
        it("[case] - consumes rejectBootstrap with the original process and transaction", async () => {
            // Arrange
            const { commands, projectService, transaction, consume } = helpers.commands();
            const request = {
                actor: ACTOR,
                realm: REALM,
                input: { type: RealmType.PROJECT as const, resource: ID, process: "process-id", reason: "Rejected" },
            };
            projectService.rejectBootstrap.mockResolvedValue(undefined);

            // Act
            await commands.rejectBootstrap({ ...request, incoming: INCOMING });

            // Assert
            expect(projectService.rejectBootstrap.mock.calls).toEqual([
                [{ ...request, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([[expect.objectContaining({ incoming: INCOMING })]]);
        });
    });
});
