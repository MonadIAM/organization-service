import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { ChangeLogUnitHelpers } from "~testing/unit/domain-service/change-log.helpers";

const EXPIRATION_DATE = new Date("2026-01-01T00:00:00.000Z");
const BATCH_SIZE = 50;

const helpers = new ChangeLogUnitHelpers();

describe("[DomainService] - ChangeLog", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - purgeExpired", () => {
        it("[case] - finds expired entries by batch size, removes them, and returns them", async () => {
            // Arrange
            const first = helpers.createChangeLog();
            const second = helpers.createChangeLog();
            const { service, repositories, transaction } = helpers.service();
            repositories.changeLogs.find.mockImplementation(() => Promise.resolve([first, second]));

            // Act
            const result = await service.purgeExpired({
                expirationDate: EXPIRATION_DATE,
                batchSize: BATCH_SIZE,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(result).toEqual([first, second]);
            expect(repositories.changeLogs.find).toHaveBeenCalledWith({
                where: { createdAt: { $lt: EXPIRATION_DATE } },
                options: { limit: BATCH_SIZE },
                transaction: transaction.entityManager,
            });
            expect(transaction.remove).toHaveBeenNthCalledWith(1, first);
            expect(transaction.remove).toHaveBeenNthCalledWith(2, second);
        });
    });
});
