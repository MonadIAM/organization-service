import { describe, expect, it } from "@jest/globals";

import { ChangeLogQueriesUnitHelpers } from "~testing/unit/query-services/change-log.helpers";

const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new ChangeLogQueriesUnitHelpers();

describe("[Queries] - ChangeLog", () => {
    describe("[Behavior] - scoped reads", () => {
        it("[case] - loads the requested log and preserves the returned page", async () => {
            // Arrange
            const { queries, changeLogRepository: repository } = helpers.queries();
            const log = helpers.createChangeLog();
            const page: [SystemEntities.ChangeLog[], number] = [[log], 30];
            repository.findUniqueOrThrow.mockResolvedValue(log);
            repository.findMany.mockResolvedValue(page);

            // Act
            const single = await queries.findUnique({ log: ID });
            const result = await queries.findMany({ pagination: PAGINATION, filters: {}, sort: {} });

            // Assert
            expect(single).toBe(log);
            expect(result).toBe(page);
            expect(repository.findUniqueOrThrow.mock.calls).toEqual([[{ where: { id: ID } }]]);
            expect(repository.findMany.mock.calls).toEqual([[expect.objectContaining({ pagination: PAGINATION })]]);
        });
    });
});
