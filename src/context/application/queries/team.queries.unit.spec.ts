import { describe, expect, it } from "@jest/globals";

import { TeamQueriesUnitHelpers } from "~testing/unit/query-services/team.helpers";
import { QueryMode, ResponseViewType, PermissionCode } from "~context/enums";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new TeamQueriesUnitHelpers();

describe("[Queries] - Team", () => {
    describe("[Behavior] - scoped reads", () => {
        it.each([
            { name: "no read permission", permissions: [], expected: { $or: [] } },
            {
                name: "common",
                permissions: [PermissionCode.TEAM_READ_COMMON],
                expected: { $or: [{ organization: { realm: REALM } }] },
            },
            { name: "absolute", permissions: [PermissionCode.TEAM_READ_ABSOLUTE], expected: {} },
        ])("[case] - applies $name visibility to single and paged reads", async ({ permissions, expected }) => {
            // Arrange
            const { queries, teamRepository: repository } = helpers.queries();
            const entity = helpers.createTeam();
            repository.findUniqueOrThrow.mockResolvedValue(entity);
            repository.findMany.mockResolvedValue([[entity], 1]);

            // Act
            await queries.findUnique({
                mode: QueryMode.DEFAULT,
                view: ResponseViewType.COMPACT,
                actor: ACTOR,
                realm: REALM,
                permissions,
                team: ID,
            });
            await queries.findMany({
                mode: QueryMode.DEFAULT,
                view: ResponseViewType.COMPACT,
                actor: ACTOR,
                realm: REALM,
                permissions,
                pagination: PAGINATION,
                filters: {},
                sort: {},
            });

            // Assert
            expect(repository.findUniqueOrThrow.mock.calls).toEqual([
                [expect.objectContaining({ where: { id: ID, ...expected } })],
            ]);
            expect(repository.findMany.mock.calls).toEqual([[expect.objectContaining({ prefilter: expected })]]);
        });

        it("[case] - uses management scope without imposing the caller's membership", async () => {
            // Arrange
            const { queries, teamRepository: repository } = helpers.queries();
            repository.findMany.mockResolvedValue([[], 0]);
            repository.findUniqueOrThrow.mockResolvedValue(helpers.createTeam());

            // Act
            await queries.findUnique({ mode: QueryMode.MANAGE, view: ResponseViewType.COMPACT, team: ID });
            await queries.findMany({
                mode: QueryMode.MANAGE,
                view: ResponseViewType.COMPACT,
                pagination: PAGINATION,
                filters: {},
                sort: {},
            });

            // Assert
            expect(repository.findUniqueOrThrow.mock.calls).toEqual([[expect.objectContaining({ where: { id: ID } })]]);
            expect(repository.findMany.mock.calls).toEqual([[expect.objectContaining({ prefilter: {} })]]);
        });
    });

    describe("[Method] - getLookupList", () => {
        it.each([QueryMode.DEFAULT, QueryMode.MANAGE])(
            "[case] - %s scopes lookup results as well as ordinary lists",
            async (mode) => {
                // Arrange
                const { queries, teamRepository: repository } = helpers.queries();
                repository.getLookupList.mockResolvedValue([[], 0]);

                // Act
                await queries.getLookupList({
                    mode,
                    actor: ACTOR,
                    realm: REALM,
                    organization: "organization-a",
                    permissions: [],
                    pagination: PAGINATION,
                    term: "search",
                });

                // Assert
                expect(repository.getLookupList.mock.calls).toEqual([
                    [
                        expect.objectContaining({
                            organization: "organization-a",
                            term: "search",
                            prefilter: mode === QueryMode.DEFAULT ? { $or: [] } : undefined,
                        }),
                    ],
                ]);
            },
        );
    });
});
