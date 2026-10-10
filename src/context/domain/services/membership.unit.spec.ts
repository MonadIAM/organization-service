import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { MembershipUnitHelpers } from "~testing/unit/domain-service/membership.helpers";
import { MembershipStatus } from "~context/enums";

/* eslint-disable prettier/prettier */
const REALM_ID        = "00000000-0000-4000-8000-100000000001";
const ORGANIZATION_ID = "00000000-0000-4000-8000-100000000002";
const MEMBERSHIP_ID   = "00000000-0000-4000-8000-100000000003";
const ACCOUNT_ID      = "00000000-0000-4000-8000-100000000004";
/* eslint-enable prettier/prettier */

const helpers = new MembershipUnitHelpers();

describe("[DomainService] - Membership", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - join", () => {
        it("[case] - creates and persists a membership when none exists", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
                realm: REALM_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                organizations: [organization],
            });
            repositories.memberships.findUnique.mockImplementation(() => Promise.resolve(null));

            // Act
            const result = await service.join({
                input: { organization: ORGANIZATION_ID, account: ACCOUNT_ID },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            expect(result).toEqual(expect.objectContaining({ organization, account: ACCOUNT_ID }));
            expect(transaction.persist).toHaveBeenCalledWith(result);
        });

        it("[case] - reactivates a left membership and rejects every other existing status", async () => {
            // Arrange
            const membership = helpers.createMembership({
                id: MEMBERSHIP_ID,
                status: MembershipStatus.LEFT,
            });
            const { service, repositories, transaction } = helpers.service({
                memberships: [membership],
            });
            repositories.memberships.findUnique.mockImplementation(() => Promise.resolve(membership));

            // Act
            const result = await service.join({
                input: {
                    organization: membership.organization.id,
                    account: ACCOUNT_ID,
                },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });
            const result1 = membership.status;
            const result2 = service.join({
                input: {
                    organization: membership.organization.id,
                    account: ACCOUNT_ID,
                },
                transaction: transaction.entityManager,
                realm: REALM_ID,
            });

            // Assert
            expect(result).toBe(membership);
            expect(result1).toBe(MembershipStatus.JOINING);
            await expect(result2).rejects.toThrow("services.membership.MEMBERSHIP_ALREADY_EXISTS");
        });
    });

    describe("[Behavior] - suspension lifecycle", () => {
        it("[case] - deduplicates identifiers and rejects incomplete bulk selections", async () => {
            // Arrange
            const membership = helpers.createMembership({ id: MEMBERSHIP_ID });
            const { service, repositories, transaction } = helpers.service({
                memberships: [membership],
            });

            // Act
            await service.suspend({
                identifiers: [MEMBERSHIP_ID, MEMBERSHIP_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });
            const calls = repositories.memberships.find.mock.calls.slice();
            repositories.memberships.find.mockImplementation(() => Promise.resolve([]));
            const result = service.resume({
                identifiers: [MEMBERSHIP_ID],
                realm: REALM_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(calls).toContainEqual([
                {
                    where: {
                        id: { $in: [MEMBERSHIP_ID] },
                        organization: { realm: REALM_ID },
                    },
                    options: { populate: ["organization"], refresh: true },
                    transaction: transaction.entityManager,
                },
            ]);
            await expect(result).rejects.toThrow("services.membership.MEMBERSHIPS_NOT_FOUND");
        });
    });

    describe("[Behavior] - membership removal", () => {
        it.each([
            {
                operation: "leave" as const,
                expectedStatus: MembershipStatus.LEFT,
            },
            {
                operation: "block" as const,
                expectedStatus: MembershipStatus.BLOCKED,
            },
        ])(
            "[case] - $operation performs the full business operation and returns its aggregate result",
            async ({ operation, expectedStatus }) => {
                // Arrange
                const membership = helpers.createMembership({
                    id: MEMBERSHIP_ID,
                });
                const projectAssignment = helpers.createProjectAccountAssignment({
                    membership,
                });
                const { service, services, repositories, transaction } = helpers.service({
                    memberships: [membership],
                });
                services.projectAssignments.clean.mockImplementation(() => Promise.resolve([projectAssignment]));

                // Act
                const result = await service[operation]({
                    account: membership.account,
                    identifiers: [MEMBERSHIP_ID],
                    realm: REALM_ID,
                    transaction: transaction.entityManager,
                });

                // Assert
                expect(membership.status).toBe(expectedStatus);
                expect(repositories.memberships.find).toHaveBeenCalledWith({
                    where: {
                        id: { $in: [MEMBERSHIP_ID] },
                        organization: { realm: REALM_ID },
                        ...(operation === "leave" ? { account: membership.account } : {}),
                    },
                    options: { populate: ["organization"], refresh: true },
                    transaction: transaction.entityManager,
                });
                expect(services.projectAssignments.clean).toHaveBeenCalledWith({
                    memberships: [MEMBERSHIP_ID],
                    transaction: transaction.entityManager,
                });
                expect(result).toEqual({
                    access: [
                        {
                            realm: membership.organization.realm,
                            account: membership.account,
                        },
                    ],
                    memberships: [membership],
                    assignments: {
                        project: [projectAssignment],
                    },
                });
            },
        );
    });
});
