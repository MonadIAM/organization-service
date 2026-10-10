import { describe, expect, it } from "@jest/globals";

import { AuditLogQueriesUnitHelpers } from "~testing/unit/query-services/audit-log.helpers";
import { QueryMode } from "~context/enums";

const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new AuditLogQueriesUnitHelpers();

describe("[Queries] - AuditLog", () => {
    describe("[Behavior] - scoped reads", () => {
        it("[case] - loads the requested log and preserves the returned page", async () => {
            // Arrange
            const { queries, auditLogRepository: repository } = helpers.queries();
            const log = helpers.createAuditLog();
            const page: [SystemEntities.AuditLog[], number] = [[log], 30];
            repository.findUniqueOrThrow.mockResolvedValue(log);
            repository.findMany.mockResolvedValue(page);

            // Act
            const single = await queries.findUnique({ log: ID, mode: QueryMode.DEFAULT, realm: REALM });
            const result = await queries.findMany({
                pagination: PAGINATION,
                filters: {},
                sort: {},
                mode: QueryMode.DEFAULT,
                realm: REALM,
            });

            // Assert
            expect(single).toBe(log);
            expect(result).toBe(page);
            expect(repository.findUniqueOrThrow.mock.calls).toEqual([[{ where: { id: ID, realm: REALM } }]]);
            expect(repository.findMany.mock.calls).toEqual([
                [expect.objectContaining({ pagination: PAGINATION, prefilter: { realm: REALM } })],
            ]);
        });

        it("[case] - allows management log reads across realms", async () => {
            // Arrange
            const { queries, auditLogRepository } = helpers.queries();
            auditLogRepository.findMany.mockResolvedValue([[], 0]);
            auditLogRepository.findUniqueOrThrow.mockResolvedValue(helpers.createAuditLog());

            // Act
            await queries.findUnique({ mode: QueryMode.MANAGE, log: ID });
            await queries.findMany({ mode: QueryMode.MANAGE, pagination: PAGINATION, filters: {}, sort: {} });

            // Assert
            expect(auditLogRepository.findUniqueOrThrow.mock.calls).toEqual([[{ where: { id: ID } }]]);
            expect(auditLogRepository.findMany.mock.calls).toEqual([[expect.objectContaining({ prefilter: {} })]]);
        });
    });
});
