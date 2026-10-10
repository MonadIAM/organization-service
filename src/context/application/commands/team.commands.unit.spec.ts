import { describe, expect, it } from "@jest/globals";

import { TeamCommandsUnitHelpers } from "~testing/unit/command-services/team.helpers";
import { KafkaTopic, PositionTopicAction } from "~context/enums";

import { TeamMapper } from "../mappers/team.mapper";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const CONTEXT: Extract.Meta = { ip: "127.0.0.1", userAgent: "unit-test" };
const helpers = new TeamCommandsUnitHelpers();

describe("[Commands] - Team", () => {
    describe("[Method] - create", () => {
        it("[case] - creates in a transaction with the required ownership scope", async () => {
            // Arrange
            const { commands, teamService, transaction, run } = helpers.commands();
            const input = { department: "parent-id", name: "New entity", description: "Description" };
            const created = helpers.createTeam();
            teamService.create.mockResolvedValue(created);

            // Act
            await commands.create({ input, actor: ACTOR, context: CONTEXT, realm: REALM });

            // Assert
            expect(teamService.create.mock.calls).toEqual([
                [{ input, transaction: transaction.entityManager, realm: REALM }],
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
            { method: "purge", count: 2 },
        ] as const)(
            "[case] - $method preserves realm scope and reports $count changed entities",
            async ({ method, count }) => {
                // Arrange
                const { commands, teamService, transaction, run } = helpers.commands();
                const entities = Array.from({ length: count }, () => helpers.createTeam());
                const input = { identifiers: [ID, "another-id", "unchanged-id"], reason: "Requested change" };
                teamService[method].mockResolvedValue(entities);

                // Act
                const result = await commands[method]({ input, actor: ACTOR, realm: REALM, context: CONTEXT });

                // Assert
                expect(teamService[method].mock.calls).toEqual([
                    [{ identifiers: input.identifiers, realm: REALM, transaction: transaction.entityManager }],
                ]);
                expect(result.params).toEqual(count > 1 ? { count } : undefined);
                expect(run).toHaveBeenCalledTimes(1);
            },
        );
    });

    describe("[Method] - update", () => {
        it("[case] - updates only the patch within the requested realm", async () => {
            // Arrange
            const { commands, teamService, transaction } = helpers.commands();
            const input = { patch: { name: "Renamed" }, reason: "Correction" };

            // Act
            await commands.update({ input, id: ID, realm: REALM, actor: ACTOR, context: CONTEXT });

            // Assert
            expect(teamService.update.mock.calls).toEqual([
                [{ patch: input.patch, id: ID, realm: REALM, transaction: transaction.entityManager }],
            ]);
        });
    });

    describe("[Method] - changeLead", () => {
        it.each([ID, null])("[case] - changes the responsible position to %s within the realm", async (position) => {
            // Arrange
            const { commands, teamService, transaction, run } = helpers.commands();
            const team = helpers.createTeam();
            teamService.changeLead.mockResolvedValue(team);

            // Act
            await commands.changeLead({
                input: { position, reason: "Rotation" },
                id: ID,
                realm: REALM,
                actor: ACTOR,
                context: CONTEXT,
            });
            const result = teamService.changeLead.mock.calls;
            const calls2 = run.mock.calls.slice();
            const result3 = await run.mock.results[0].value;

            // Assert
            expect(result).toEqual([[{ position, id: ID, realm: REALM, transaction: transaction.entityManager }]]);
            expect(calls2).toContainEqual([
                expect.objectContaining({
                    outbox: {
                        payloadMapper: TeamMapper.prototype.referencePayload,
                        destinationTopic: KafkaTopic.POSITION,
                        actionType: PositionTopicAction.REFERENCE_REQUESTED,
                    },
                }),
            ]);
            expect(result3).toEqual({ team, actor: ACTOR, realm: REALM });
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - schedules HR cleanup for the removed entities in the deletion transaction", async () => {
            // Arrange
            const { commands, teamService, run } = helpers.commands();
            const teams = [helpers.createTeam(), helpers.createTeam()];
            const input = { identifiers: teams.map((entity) => entity.id), reason: "Cleanup" };
            teamService.purge.mockResolvedValue(teams);

            // Act
            await commands.purge({ input, actor: ACTOR, realm: REALM, context: CONTEXT });
            const calls = run.mock.calls.slice();
            const calls1 = run.mock.calls.slice();
            const result = await run.mock.results[0].value;

            // Assert
            expect(calls).toHaveLength(1);
            expect(calls1).toContainEqual([
                expect.objectContaining({
                    changeLog: true,
                    outbox: {
                        payloadMapper: TeamMapper.prototype.purgePayload,
                        destinationTopic: KafkaTopic.POSITION,
                        actionType: PositionTopicAction.TEAM_PURGED,
                    },
                }),
            ]);
            expect(result).toEqual({ teams, actor: ACTOR, realm: REALM });
        });
    });

    describe("[Method] - archive", () => {
        it("[case] - propagates a domain failure through the transaction", async () => {
            // Arrange
            const { commands, teamService } = helpers.commands();
            const failure = new Error("domain rejected mutation");
            teamService.archive.mockRejectedValue(failure);

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
});
