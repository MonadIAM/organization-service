import { describe, expect, it } from "@jest/globals";

import { DepartmentQueriesUnitHelpers } from "~testing/unit/query-services/department.helpers";
import { QueryMode, ResponseViewType } from "~context/enums";
import { PublicLinkOperator, PublicStringOperator } from "~infrastructure/database/enums";

const ORGANIZATION = "organization-a";
const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new DepartmentQueriesUnitHelpers();

describe("[Queries] - Department", () => {
    describe("[Method] - findUnique", () => {
        it("[case] - scopes single reads by organization and realm", async () => {
            // Arrange
            const { queries, departmentRepository: repository } = helpers.queries();
            repository.findUniqueOrThrow.mockResolvedValue(helpers.createDepartment());
            const props = { organization: ORGANIZATION, realm: REALM, view: ResponseViewType.COMPACT };

            // Act
            await queries.findUnique({ ...props, department: ID });

            // Assert
            expect(repository.findUniqueOrThrow.mock.calls).toEqual([
                [expect.objectContaining({ where: { id: ID, organization: { id: ORGANIZATION, realm: REALM } } })],
            ]);
        });
    });

    describe("[Method] - findMany", () => {
        it("[case] - scopes list reads by organization and realm", async () => {
            // Arrange
            const { queries, departmentRepository: repository } = helpers.queries();
            const props = { organization: ORGANIZATION, realm: REALM, view: ResponseViewType.COMPACT };

            // Act
            await queries.findMany({ ...props, mode: QueryMode.DEFAULT, pagination: PAGINATION, filters: {}, sort: {} });

            // Assert
            expect(repository.findMany.mock.calls).toEqual([
                [expect.objectContaining({ prefilter: { organization: { id: ORGANIZATION, realm: REALM } }, filters: {} })],
            ]);
        });

        it("[case] - allows management lists to select organization as a filter without a realm prefilter", async () => {
            // Arrange
            const { queries, departmentRepository: repository } = helpers.queries();
            const filters = { organization: { operator: PublicLinkOperator.EQUAL, value: ORGANIZATION } };

            // Act
            await queries.findMany({
                mode: QueryMode.MANAGE,
                view: ResponseViewType.COMPACT,
                pagination: PAGINATION,
                filters,
                sort: {},
            });

            // Assert
            expect(repository.findMany.mock.calls).toEqual([[expect.objectContaining({ prefilter: undefined, filters })]]);
        });
    });

    describe("[Method] - getHierarchyGraph", () => {
        it("[case] - passes the required realm to graph reads", async () => {
            // Arrange
            const { queries, departmentRepository: repository } = helpers.queries();
            const scope = { organization: ORGANIZATION, realm: REALM };

            // Act
            await queries.getHierarchyGraph(scope);

            // Assert
            expect(repository.getHierarchyGraph.mock.calls).toEqual([[scope]]);
        });
    });

    describe("[Method] - getLookupList", () => {
        it("[case] - passes the required realm to lookup reads", async () => {
            // Arrange
            const { queries, departmentRepository: repository } = helpers.queries();
            const props = { organization: ORGANIZATION, realm: REALM, pagination: PAGINATION, term: "search" };

            // Act
            await queries.getLookupList(props);

            // Assert
            expect(repository.getLookupList.mock.calls).toEqual([[props]]);
        });
    });

    describe.each([ResponseViewType.COMPACT, ResponseViewType.DETAILED])("[Behavior] - view %s", (view) => {
        it.each(["ancestors", "descendants"] as const)(
            "[case] - passes filters, scope and populate for %s",
            async (direction) => {
                // Arrange
                const { queries, departmentRepository: repository } = helpers.queries();
                const filters = { name: { operator: PublicStringOperator.EQUAL, value: "Department" } };
                const scope = { organization: ORGANIZATION, realm: REALM, pagination: PAGINATION, filters };
                const populate = view === ResponseViewType.DETAILED ? ["organization"] : [];

                // Act
                if (direction === "ancestors") {
                    await queries.findAncestors({ ...scope, descendant: ID, view });
                } else {
                    await queries.findDescendants({ ...scope, ancestor: ID, view });
                }

                // Assert
                if (direction === "ancestors") {
                    expect(repository.findAncestors.mock.calls).toEqual([[{ ...scope, descendant: ID, populate }]]);
                } else {
                    expect(repository.findDescendants.mock.calls).toEqual([[{ ...scope, ancestor: ID, populate }]]);
                }
            },
        );
    });
});
