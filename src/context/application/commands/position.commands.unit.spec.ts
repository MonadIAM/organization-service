import { describe, expect, it } from "@jest/globals";

import { PositionReferenceType, PositionTopicAction, KafkaTopic, ActionType, EntityType } from "~context/enums";
import { PositionCommandsUnitHelpers } from "~testing/unit/command-services/position.helpers";
import { CONSUMER_META } from "~context/constants";
import { Exception } from "~common/exceptions";

import { PositionMapper } from "../mappers/position.mapper";

const INCOMING: TransactionManager.Service.IncomingMessage = { consumerKey: "unit-consumer", event: "incoming-event" };
const REQUEST: Topics.Position.PlacementRequestedMessage["payload"] = {
    actor: "actor-account",
    realm: "organization-realm",
    input: {
        organization: "organization-a",
        department: "department-a",
        team: "team-a",
        position: "position-a",
        process: "placement-process",
    },
};
const helpers = new PositionCommandsUnitHelpers();

describe("[Commands] - Position", () => {
    describe("[Method] - validatePlacement", () => {
        it("[case] - validates the placement and schedules a correlated confirmation in the incoming transaction", async () => {
            // Arrange
            const { commands, positionService, consume, transaction } = helpers.commands();

            // Act
            await commands.validatePlacement({ incoming: INCOMING, ...REQUEST });
            const result = positionService.validatePlacement.mock.calls;
            const result3 = consume.mock.calls;
            const result4 = await consume.mock.results[0].value;

            // Assert
            expect(result).toEqual([[{ ...REQUEST, transaction: transaction.entityManager }]]);
            expect(result3).toEqual([
                [
                    expect.objectContaining({
                        incoming: INCOMING,
                        resource: "Position",
                        changeLog: true,
                        audit: {
                            entityType: EntityType.POSITION,
                            actionType: ActionType.UPDATE,
                            context: CONSUMER_META,
                            ...REQUEST,
                        },
                        outbox: {
                            payloadMapper: PositionMapper.prototype.confirmed,
                            actionType: PositionTopicAction.PLACEMENT_CONFIRMED,
                            destinationTopic: KafkaTopic.POSITION,
                        },
                    }),
                ],
            ]);
            expect(result4).toEqual({
                status: "processed",
                value: { request: REQUEST },
            });
        });

        it("[case] - turns a business refusal into a rejection with the original process and reason", async () => {
            // Arrange
            const { commands, positionService, consume } = helpers.commands();
            const error = Exception.notFound({ messageKey: "placement not found" });
            positionService.validatePlacement.mockRejectedValue(error);

            // Act
            await commands.validatePlacement({ incoming: INCOMING, ...REQUEST });

            // Assert
            expect(consume).toHaveBeenCalledTimes(2);
            expect(consume).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    payload: { ...REQUEST, input: { ...REQUEST.input, reason: error.message } },
                    actionType: PositionTopicAction.PLACEMENT_REJECTED,
                    destinationTopic: KafkaTopic.POSITION,
                    incoming: INCOMING,
                }),
            );
        });

        it.each([
            { name: "retryable dependency failure", error: Exception.externalServiceFailed({ messageKey: "unavailable" }) },
            { name: "unexpected failure", error: new Error("unexpected") },
        ])("[case] - propagates $name without consuming a rejection", async ({ error }) => {
            // Arrange
            const { commands, positionService, consume } = helpers.commands();
            positionService.validatePlacement.mockRejectedValue(error);

            // Act
            const result = commands.validatePlacement({ incoming: INCOMING, ...REQUEST });

            // Assert
            await expect(result).rejects.toBe(error);
            expect(consume).toHaveBeenCalledTimes(1);
        });

        it("[case] - does not validate a message already claimed by the inbox", async () => {
            // Arrange
            const { commands, positionService, consume } = helpers.commands();
            consume.mockResolvedValue({ status: "duplicate" });

            // Act
            await commands.validatePlacement({ incoming: INCOMING, ...REQUEST });

            // Assert
            expect(positionService.validatePlacement).not.toHaveBeenCalled();
            expect(consume).toHaveBeenCalledTimes(1);
        });
    });

    describe("[Method] - rejectPlacement", () => {
        it("[case] - records a terminal rejection and its audit without repeating domain validation", async () => {
            // Arrange
            const { commands, positionService, consume } = helpers.commands();
            const reason = "retries exhausted";

            // Act
            await commands.rejectPlacement({ incoming: INCOMING, request: REQUEST, reason });

            // Assert
            expect(positionService.validatePlacement).not.toHaveBeenCalled();
            expect(consume.mock.calls).toEqual([
                [
                    {
                        incoming: INCOMING,
                        resource: "Position",
                        payload: { ...REQUEST, input: { ...REQUEST.input, reason } },
                        destinationTopic: KafkaTopic.POSITION,
                        actionType: PositionTopicAction.PLACEMENT_REJECTED,
                        audit: {
                            input: { request: REQUEST, reason },
                            entityType: EntityType.POSITION,
                            actionType: ActionType.UPDATE,
                            context: CONSUMER_META,
                            actor: REQUEST.actor,
                            realm: REQUEST.realm,
                        },
                    },
                ],
            ]);
        });

        it("[case] - propagates a failure to persist the rejection", async () => {
            // Arrange
            const { commands, consume } = helpers.commands();
            const error = new Error("outbox unavailable");
            consume.mockRejectedValue(error);

            // Act
            const result = commands.rejectPlacement({ incoming: INCOMING, request: REQUEST, reason: "refused" });

            // Assert
            await expect(result).rejects.toBe(error);
            expect(consume).toHaveBeenCalledTimes(1);
        });
    });

    describe("[Method] - completeReference", () => {
        it.each([
            { type: PositionReferenceType.DEPARTMENT_MANAGER, rejected: false },
            { type: PositionReferenceType.DEPARTMENT_MANAGER, rejected: true },
            { type: PositionReferenceType.TEAM_LEAD, rejected: false },
            { type: PositionReferenceType.TEAM_LEAD, rejected: true },
        ])(
            "[case] - completes $type with rejected=$rejected using the response correlation",
            async ({ type, rejected }) => {
                // Arrange
                const { commands, positionService, consume, transaction } = helpers.commands();
                const request: Topics.Position.ReferenceRequestedMessage["payload"] = {
                    actor: REQUEST.actor,
                    realm: REQUEST.realm,
                    input:
                        type === PositionReferenceType.TEAM_LEAD
                            ? { ...REQUEST.input, type }
                            : {
                                  organization: REQUEST.input.organization,
                                  department: REQUEST.input.department,
                                  position: REQUEST.input.position,
                                  process: REQUEST.input.process,
                                  type,
                              },
                };

                // Act
                await commands.completeReference({ incoming: INCOMING, ...request, rejected });

                // Assert
                expect(positionService.completeReference.mock.calls).toEqual([
                    [{ ...request, transaction: transaction.entityManager, rejected }],
                ]);
                expect(consume).toHaveBeenCalledTimes(1);
                expect(consume).toHaveBeenCalledWith(
                    expect.objectContaining({
                        incoming: INCOMING,
                        changeLog: true,
                        audit: expect.objectContaining({ ...request, context: CONSUMER_META }),
                    }),
                );
                expect(consume.mock.calls[0][0]).not.toHaveProperty("outbox");
            },
        );
    });

    describe("[Method] - release", () => {
        it("[case] - removes references for the event positions within their organization", async () => {
            // Arrange
            const { commands, positionService, consume, transaction } = helpers.commands();
            const request: Topics.Position.LifecycleMessage["payload"] = {
                input: { organization: REQUEST.input.organization, positions: ["position-a", "position-b"] },
                actor: REQUEST.actor,
                realm: REQUEST.realm,
            };

            // Act
            await commands.release({ incoming: INCOMING, ...request });

            // Assert
            expect(positionService.release.mock.calls).toEqual([[{ ...request, transaction: transaction.entityManager }]]);
            expect(consume).toHaveBeenCalledTimes(1);
            expect(consume).toHaveBeenCalledWith(
                expect.objectContaining({
                    incoming: INCOMING,
                    changeLog: true,
                    audit: expect.objectContaining({ ...request, context: CONSUMER_META }),
                }),
            );
            expect(consume.mock.calls[0][0]).not.toHaveProperty("outbox");
        });

        it("[case] - propagates cleanup failure so the consumer can retry", async () => {
            // Arrange
            const { commands, positionService, consume } = helpers.commands();
            const error = new Error("cleanup unavailable");
            positionService.release.mockRejectedValue(error);
            const request = {
                input: { organization: REQUEST.input.organization, positions: ["position-a"] },
                actor: REQUEST.actor,
                realm: REQUEST.realm,
            };

            // Act
            const result = commands.release({ incoming: INCOMING, ...request });

            // Assert
            await expect(result).rejects.toBe(error);
            expect(consume).toHaveBeenCalledTimes(1);
        });
    });
});
