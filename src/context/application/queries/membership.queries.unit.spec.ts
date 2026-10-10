import { describe, expect, it } from "@jest/globals";

import { MembershipQueriesUnitHelpers } from "~testing/unit/query-services/membership.helpers";
import { QueryMode, ResponseViewType, PermissionCode } from "~context/enums";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new MembershipQueriesUnitHelpers();

describe("[Queries] - Membership", () => {
    describe("[Behavior] - scoped reads", () => {
        it.each([
            { name: "no read permission", permissions: [], expected: { $or: [] } },
            {
                name: "personal",
                permissions: [PermissionCode.MEMBERSHIP_READ_PERSONAL],
                expected: { $or: [{ account: ACTOR }] },
            },
            {
                name: "common",
                permissions: [PermissionCode.MEMBERSHIP_READ_COMMON],
                expected: { $or: [{ organization: { realm: REALM } }] },
            },
            {
                name: "combined",
                permissions: [PermissionCode.MEMBERSHIP_READ_COMMON, PermissionCode.MEMBERSHIP_READ_PERSONAL],
                expected: { $or: [...[{ organization: { realm: REALM } }], { account: ACTOR }] },
            },
            {
                name: "absolute",
                permissions: [PermissionCode.MEMBERSHIP_READ_ABSOLUTE, PermissionCode.MEMBERSHIP_READ_PERSONAL],
                expected: {},
            },
        ])("[case] - applies $name visibility to single and paged reads", async ({ permissions, expected }) => {
            // Arrange
            const { queries, membershipRepository: repository } = helpers.queries();
            const entity = helpers.createMembership();
            repository.findUniqueOrThrow.mockResolvedValue(entity);
            repository.findMany.mockResolvedValue([[entity], 1]);

            // Act
            await queries.findUnique({
                mode: QueryMode.DEFAULT,
                view: ResponseViewType.COMPACT,
                actor: ACTOR,
                realm: REALM,
                permissions,
                membership: ID,
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
            const { queries, membershipRepository: repository } = helpers.queries();
            repository.findMany.mockResolvedValue([[], 0]);
            repository.findUniqueOrThrow.mockResolvedValue(helpers.createMembership());

            // Act
            await queries.findUnique({ mode: QueryMode.MANAGE, view: ResponseViewType.COMPACT, membership: ID });
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
});
