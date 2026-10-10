import { describe, expect, it } from "@jest/globals";

import { AccountCommandsUnitHelpers } from "~testing/unit/command-services/account.helpers";
import { KafkaTopic, RealmTopicAction } from "~context/enums";

const ACCOUNT = "target-account";
const INCOMING: TransactionManager.Service.IncomingMessage = { consumerKey: "unit-consumer", event: "incoming-event" };
const helpers = new AccountCommandsUnitHelpers();

describe("[Commands] - Account", () => {
    describe("[Method] - purge", () => {
        it("[case] - consumes account deletion and schedules realm and access cleanup together", async () => {
            // Arrange
            const { commands, accountService, transaction, consume } = helpers.commands();

            // Act
            await commands.purge({ incoming: INCOMING, account: ACCOUNT });

            // Assert
            expect(accountService.purge.mock.calls).toEqual([
                [{ account: ACCOUNT, transaction: transaction.entityManager }],
            ]);
            expect(consume.mock.calls).toEqual([
                [
                    expect.objectContaining({
                        incoming: INCOMING,
                        outbox: [
                            expect.objectContaining({
                                destinationTopic: KafkaTopic.REALM,
                                actionType: RealmTopicAction.SYSTEM_PURGE,
                            }),
                            expect.objectContaining({
                                destinationTopic: KafkaTopic.REALM,
                                actionType: RealmTopicAction.ACCOUNT_ACCESS_PURGE,
                            }),
                        ],
                    }),
                ],
            ]);
        });
    });
});
