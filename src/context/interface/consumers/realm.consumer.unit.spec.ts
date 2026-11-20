import { describe, expect, it, jest } from "@jest/globals";

import { KafkaClient } from "~infrastructure/kafka";
import { RealmTopicAction } from "~context/enums";

import { RealmConsumer } from "./realm.consumer";

describe("[Consumer] - Realm join routing", () => {
    it.each([RealmTopicAction.MEMBERSHIP_JOIN_CONFIRMED, RealmTopicAction.MEMBERSHIP_JOIN_REJECTED])(
        "[case] - routes %s by the actual initiating workflow",
        async (actionType) => {
            const confirmJoin = jest.fn<Commands.Invite.ConsumerContract["confirmJoin"]>();
            const rejectJoin = jest.fn<Commands.Invite.ConsumerContract["rejectJoin"]>();
            const completeEnsure = jest.fn<Commands.Membership.ConsumerContract["completeEnsure"]>();
            const schemaRegistry = {
                decode: jest.fn<Kafka.SchemaRegistry.Decode.Signature>(),
                validate: jest.fn<Kafka.SchemaRegistry.Validate.Signature>(),
            };
            const consumer = new RealmConsumer(
                {} as Commands.Organization.ConsumerContract,
                { completeEnsure } as unknown as Commands.Membership.ConsumerContract,
                {} as Commands.Project.ConsumerContract,
                { confirmJoin, rejectJoin } as unknown as Commands.Invite.ConsumerContract,
                {} as Observability.Metrics.Kafka.PublicContract,
                schemaRegistry as unknown as Kafka.SchemaRegistry.PublicContract,
                {} as Kafka.Retry.Contract,
                {} as KafkaClient,
            );
            const process = async (input: UnknownObject): Promise<void> => {
                schemaRegistry.decode.mockResolvedValue({ actionType, payload: { actor: "actor", realm: "realm", input } });
                await consumer.process({ incoming: {}, message: {} } as Consumers.Realm.Process.Props);
            };

            // A project membership has neither an invitation nor an HR request.
            await process({ membership: "membership", process: "project-assignment", command: "project-assignment" });
            expect(confirmJoin).not.toHaveBeenCalled();
            expect(rejectJoin).not.toHaveBeenCalled();
            expect(completeEnsure).not.toHaveBeenCalled();

            await process({ invite: "invitation" });
            expect(
                actionType === RealmTopicAction.MEMBERSHIP_JOIN_CONFIRMED ? confirmJoin : rejectJoin,
            ).toHaveBeenCalledTimes(1);

            await process({ hrRequest: "request" });
            expect(completeEnsure).toHaveBeenCalledTimes(1);
        },
    );
});
