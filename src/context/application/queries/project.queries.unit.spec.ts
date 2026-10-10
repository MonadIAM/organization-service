import { describe, expect, it } from "@jest/globals";

import { QueryMode, ResponseViewType, PermissionCode, MembershipStatus, AssignmentStatus } from "~context/enums";
import { ProjectQueriesUnitHelpers } from "~testing/unit/query-services/project.helpers";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new ProjectQueriesUnitHelpers();

describe("[Queries] - Project", () => {
    describe("[Behavior] - scoped reads", () => {
        it.each([
            { name: "no read permission", permissions: [], expected: { $or: [] } },
            {
                name: "personal",
                permissions: [PermissionCode.PROJECT_READ_PERSONAL],
                expected: {
                    $or: [
                        {
                            assignments: {
                                membership: {
                                    status: { $in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
                                    account: ACTOR,
                                },
                                status: AssignmentStatus.ACTIVE,
                            },
                        },
                    ],
                },
            },
            {
                name: "common",
                permissions: [PermissionCode.PROJECT_READ_COMMON],
                expected: { $or: [{ realm: REALM }, { organization: { realm: REALM } }] },
            },
            {
                name: "combined",
                permissions: [PermissionCode.PROJECT_READ_COMMON, PermissionCode.PROJECT_READ_PERSONAL],
                expected: {
                    $or: [
                        ...[{ realm: REALM }, { organization: { realm: REALM } }],
                        {
                            assignments: {
                                membership: {
                                    status: { $in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
                                    account: ACTOR,
                                },
                                status: AssignmentStatus.ACTIVE,
                            },
                        },
                    ],
                },
            },
            {
                name: "absolute",
                permissions: [PermissionCode.PROJECT_READ_ABSOLUTE, PermissionCode.PROJECT_READ_PERSONAL],
                expected: {},
            },
        ])("[case] - applies $name visibility to single and paged reads", async ({ permissions, expected }) => {
            // Arrange
            const { queries, projectRepository: repository } = helpers.queries();
            const entity = helpers.createProject();
            repository.findUniqueOrThrow.mockResolvedValue(entity);
            repository.findMany.mockResolvedValue([[entity], 1]);

            // Act
            await queries.findUnique({
                mode: QueryMode.DEFAULT,
                view: ResponseViewType.COMPACT,
                actor: ACTOR,
                realm: REALM,
                permissions,
                project: ID,
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
            const { queries, projectRepository: repository } = helpers.queries();
            repository.findMany.mockResolvedValue([[], 0]);
            repository.findUniqueOrThrow.mockResolvedValue(helpers.createProject());

            // Act
            await queries.findUnique({ mode: QueryMode.MANAGE, view: ResponseViewType.COMPACT, project: ID });
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
                const { queries, projectRepository: repository } = helpers.queries();
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
