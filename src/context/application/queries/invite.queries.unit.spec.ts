import { describe, expect, it } from "@jest/globals";

import { InviteQueriesUnitHelpers } from "~testing/unit/query-services/invite.helpers";
import { QueryMode, ResponseViewType, PermissionCode, InviteQueryScope } from "~context/enums";

const ACTOR = "actor-account";
const REALM = "realm-a";
const ID = "entity-a";
const PAGINATION: Pagination = { currentPage: 2, elementsPerPage: 10 };
const helpers = new InviteQueriesUnitHelpers();

describe("[Queries] - Invite", () => {
    describe("[Behavior] - scoped reads", () => {
        it.each([
            { name: "no read permission", permissions: [], paged: { $or: [] }, expected: { $or: [] } },
            {
                name: "personal",
                permissions: [PermissionCode.INVITE_READ_PERSONAL],
                paged: { $or: [{ inviter: ACTOR }] },
                expected: { $or: [{ $or: [{ invitee: ACTOR }, { inviter: ACTOR }] }] },
            },
            {
                name: "common",
                permissions: [PermissionCode.INVITE_READ_COMMON],
                paged: { $or: [{ organization: { realm: REALM } }] },
                expected: { $or: [{ organization: { realm: REALM } }] },
            },
            {
                name: "combined",
                permissions: [PermissionCode.INVITE_READ_COMMON, PermissionCode.INVITE_READ_PERSONAL],
                paged: { $or: [{ organization: { realm: REALM } }, { inviter: ACTOR }] },
                expected: {
                    $or: [...[{ organization: { realm: REALM } }], { $or: [{ invitee: ACTOR }, { inviter: ACTOR }] }],
                },
            },
            {
                name: "absolute",
                permissions: [PermissionCode.INVITE_READ_ABSOLUTE, PermissionCode.INVITE_READ_PERSONAL],
                paged: {},
                expected: {},
            },
        ])("[case] - applies $name visibility to single and paged reads", async ({ permissions, expected, paged }) => {
            // Arrange
            const { queries, inviteRepository: repository } = helpers.queries();
            const entity = helpers.createInvite();
            repository.findUniqueOrThrow.mockResolvedValue(entity);
            repository.findMany.mockResolvedValue([[entity], 1]);

            // Act
            await queries.findUnique({
                mode: QueryMode.DEFAULT,
                view: ResponseViewType.COMPACT,
                actor: ACTOR,
                realm: REALM,
                permissions,
                invite: ID,
            });
            await queries.findMany({
                scope: InviteQueryScope.AS_INVITER,
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
            expect(repository.findMany.mock.calls).toEqual([[expect.objectContaining({ prefilter: paged })]]);
        });

        it("[case] - uses management scope without imposing the caller's membership", async () => {
            // Arrange
            const { queries, inviteRepository: repository } = helpers.queries();
            repository.findMany.mockResolvedValue([[], 0]);
            repository.findUniqueOrThrow.mockResolvedValue(helpers.createInvite());

            // Act
            await queries.findUnique({ mode: QueryMode.MANAGE, view: ResponseViewType.COMPACT, invite: ID });
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

    describe("[Method] - findMany", () => {
        it.each([
            { scope: InviteQueryScope.AS_INVITER, expected: { inviter: ACTOR } },
            { scope: InviteQueryScope.AS_INVITEE, expected: { invitee: ACTOR } },
        ])("[case] - limits personal invitations to $scope", async ({ scope, expected }) => {
            // Arrange
            const { queries, inviteRepository } = helpers.queries();
            inviteRepository.findMany.mockResolvedValue([[], 0]);

            // Act
            await queries.findMany({
                mode: QueryMode.DEFAULT,
                actor: ACTOR,
                realm: REALM,
                permissions: [PermissionCode.INVITE_READ_PERSONAL],
                scope,
                view: ResponseViewType.COMPACT,
                pagination: PAGINATION,
                filters: {},
                sort: {},
            });

            // Assert
            expect(inviteRepository.findMany.mock.calls).toEqual([
                [expect.objectContaining({ prefilter: { $or: [expected] } })],
            ]);
        });
    });
});
