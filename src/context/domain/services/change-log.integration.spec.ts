import { describe, expect, it } from "@jest/globals";

import { ChangeLogIntegrationHelpers } from "~testing/integration/domain-service/change-log.helpers";
import { postgresSuite } from "~testing/integration/containers/postgres.suite";
import { CoreFixture } from "~testing/integration/repositories/core.fixture";
import { ChangeLog } from "~common/transaction-manager/entities";

const helpers = new ChangeLogIntegrationHelpers();

describe("[DomainService] - ChangeLog", () => {
    const suite = postgresSuite({
        repository: (context) => helpers.service(context),
        fixture: (manager) => new CoreFixture(manager),
    });

    describe("[Method] - purgeExpired", () => {
        it("[case] - purges only expired entries up to the batch size", async () => {
            // Arrange
            const expired = await suite.fixtures().createChangeLog({
                createdAt: new Date("2020-01-01T00:00:00.000Z"),
            });
            const active = await suite.fixtures().createChangeLog({
                createdAt: new Date("2030-01-01T00:00:00.000Z"),
            });

            // Act
            await suite.transaction((transaction) =>
                suite.repository().changeLogService.purgeExpired({
                    expirationDate: new Date("2025-01-01T00:00:00.000Z"),
                    batchSize: 10,
                    transaction,
                }),
            );
            const result = await suite.transaction((transaction) => transaction.count(ChangeLog, { id: expired.id }));
            const result1 = await suite.transaction((transaction) => transaction.count(ChangeLog, { id: active.id }));

            // Assert
            expect(result).toBe(0);
            expect(result1).toBe(1);
        });
    });
});
