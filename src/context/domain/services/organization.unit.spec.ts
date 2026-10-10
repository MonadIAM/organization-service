import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { LockMode } from "@mikro-orm/core";

import { OrganizationStatus, MembershipStatus, PlatformService, RealmType } from "~context/enums";
import { OrganizationUnitHelpers } from "~testing/unit/domain-service/organization.helpers";

/* eslint-disable prettier/prettier */
const ORGANIZATION_ID = "00000000-0000-4000-8000-100000000001";
const MEMBERSHIP_ID   = "00000000-0000-4000-8000-100000000002";
const ACTOR_ID        = "00000000-0000-4000-8000-100000000003";
/* eslint-enable prettier/prettier */

const helpers = new OrganizationUnitHelpers();

describe("[DomainService] - Organization", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("[Method] - create", () => {
        it("[case] - creates an organization with its owner membership and persists both", () => {
            // Arrange
            const { service, transaction } = helpers.service();

            // Act
            const result = service.create({
                input: {
                    title: "Organization",
                    description: "Description",
                },
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
            });

            // Assert
            expect(result.organization.owner).toBe(result.membership);
            expect(result.membership.account).toBe(ACTOR_ID);
            expect(transaction.persist).toHaveBeenNthCalledWith(1, result.organization);
            expect(transaction.persist).toHaveBeenNthCalledWith(2, result.membership);
        });
    });

    describe("[Behavior] - bootstrap responses", () => {
        it.each([
            [PlatformService.ACCESS_CONTROL_SERVICE, PlatformService.HR_SERVICE],
            [PlatformService.HR_SERVICE, PlatformService.ACCESS_CONTROL_SERVICE],
        ] as const)("[case] - waits for both services when %s confirms first", async (first, second) => {
            // Arrange
            const { service, repositories, transaction } = helpers.service();
            const { organization, membership } = service.create({
                input: { title: "Pending", description: "Description" },
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
            });
            repositories.organizations.findUnique.mockImplementation(() => Promise.resolve(organization));
            const request = {
                actor: ACTOR_ID,
                realm: organization.realm,
                transaction: transaction.entityManager,
                input: {
                    type: RealmType.ORGANIZATION as const,
                    resource: organization.id,
                    process: organization.process!,
                },
            };

            function confirm(
                participant: PlatformService.ACCESS_CONTROL_SERVICE | PlatformService.HR_SERVICE,
            ): Services.Organization.ConfirmBootstrap.Result {
                return service.confirmBootstrap({
                    ...request,
                    input: { ...request.input, service: participant },
                });
            }

            // Act
            await confirm(first);
            await confirm(first);
            const result = organization.status;
            const result1 = membership.status;
            const result2 = organization.bootstrapPending;
            await confirm(second);
            const result3 = organization.status;
            const result4 = membership.status;
            const result5 = organization.process;
            const result6 = organization.bootstrapPending;
            const result7 = await confirm(first);

            // Assert
            expect(result).toBe(OrganizationStatus.PROVISIONING);
            expect(result1).toBe(MembershipStatus.JOINING);
            expect(result2).toEqual([second]);
            expect(result3).toBe(OrganizationStatus.ACTIVE);
            expect(result4).toBe(MembershipStatus.ACTIVE);
            expect(result5).toBeUndefined();
            expect(result6).toEqual([]);
            expect(result7).toEqual({ realms: [] });
        });

        it.each([PlatformService.ACCESS_CONTROL_SERVICE, PlatformService.HR_SERVICE] as const)(
            "[case] - removes the organization and requests cleanup after %s succeeded and the other failed",
            async (participant) => {
                // Arrange
                const { service, repositories, transaction } = helpers.service();
                const { organization } = service.create({
                    input: { title: "Pending", description: "Description" },
                    transaction: transaction.entityManager,
                    actor: ACTOR_ID,
                });
                repositories.organizations.findUnique.mockImplementation(() => Promise.resolve(organization));
                const request = {
                    actor: ACTOR_ID,
                    realm: organization.realm,
                    transaction: transaction.entityManager,
                    input: {
                        type: RealmType.ORGANIZATION as const,
                        resource: organization.id,
                        process: organization.process!,
                    },
                };

                // Act
                await service.confirmBootstrap({ ...request, input: { ...request.input, service: participant } });
                const result = await service.rejectBootstrap({
                    ...request,
                    input: { ...request.input, reason: "Rejected" },
                });
                const calls = transaction.remove.mock.calls.slice();
                repositories.organizations.findUnique.mockImplementation(() => Promise.resolve(null));
                const result1 = await service.confirmBootstrap(request);

                // Assert
                expect(result).toEqual({ realms: [{ realm: organization.realm }] });
                expect(calls).toContainEqual([organization]);
                expect(result1).toEqual({
                    realms: [{ realm: organization.realm }],
                });
                expect(organization.status).toBe(OrganizationStatus.PROVISIONING);
            },
        );

        it("[case] - ignores a response from another process without changing either local entity", async () => {
            // Arrange
            const { service, repositories, transaction } = helpers.service();
            const { organization, membership } = service.create({
                input: { title: "Pending", description: "Description" },
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
            });
            repositories.organizations.findUnique.mockImplementation(() => Promise.resolve(organization));
            const request = {
                actor: ACTOR_ID,
                realm: organization.realm,
                transaction: transaction.entityManager,
                input: {
                    type: RealmType.ORGANIZATION as const,
                    resource: organization.id,
                    process: "stale",
                    reason: "Rejected",
                },
            };

            // Act
            const result = await service.confirmBootstrap(request);
            const result1 = await service.rejectBootstrap(request);

            // Assert
            expect(result).toEqual({ realms: [] });
            expect(result1).toEqual({ realms: [] });
            expect(organization.bootstrapPending).toHaveLength(2);
            expect(membership.status).toBe(MembershipStatus.JOINING);
            expect(transaction.remove).not.toHaveBeenCalled();
        });
    });

    describe("[Behavior] - metadata and ownership changes", () => {
        it("[case] - updates and transfers ownership using scoped repository lookups", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
            });
            const membership = helpers.createMembership({
                id: MEMBERSHIP_ID,
                organization,
            });
            const { service, repositories, transaction } = helpers.service({
                organizations: [organization],
            });
            repositories.memberships.findUniqueOrThrow.mockImplementation(() => Promise.resolve(membership));
            const updateSpy = jest.spyOn(organization, "update");

            // Act
            await service.update({
                realm: organization.realm,
                id: ORGANIZATION_ID,
                patch: { title: "Updated" },
                transaction: transaction.entityManager,
            });
            const result = await service.transferOwnership({
                realm: organization.realm,
                id: ORGANIZATION_ID,
                membership: MEMBERSHIP_ID,
                transaction: transaction.entityManager,
            });

            // Assert
            expect(updateSpy).toHaveBeenCalledWith({ patch: { title: "Updated" } });
            expect(repositories.organizations.findUniqueOrThrow).toHaveBeenCalledWith({
                where: { id: ORGANIZATION_ID, realm: organization.realm },
                transaction: transaction.entityManager,
            });
            expect(repositories.memberships.findUniqueOrThrow).toHaveBeenCalledWith({
                where: {
                    id: MEMBERSHIP_ID,
                    organization: ORGANIZATION_ID,
                    status: "ACTIVE",
                },
                options: { refresh: true },
                transaction: transaction.entityManager,
            });
            expect(result.owner).toBe(membership.account);
            expect(result.organization.pendingOwner).toBe(membership.id);
            expect(result.organization.owner.id).not.toBe(membership.id);
        });
    });

    describe("[Behavior] - revocation lifecycle", () => {
        it("[case] - deduplicates bulk identifiers and rejects incomplete repository results", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
            });
            const { service, repositories, transaction } = helpers.service({
                organizations: [organization],
                projects: [],
            });

            // Act
            const result = await service.revoke({
                identifiers: [ORGANIZATION_ID, ORGANIZATION_ID],
                transaction: transaction.entityManager,
                actor: ACTOR_ID,
                global: false,
            });
            const calls = repositories.organizations.find.mock.calls.slice();
            repositories.organizations.find.mockImplementation(() => Promise.resolve([]));
            const result1 = service.restore({
                transaction: transaction.entityManager,
                identifiers: [ORGANIZATION_ID],
                actor: ACTOR_ID,
                global: false,
            });

            // Assert
            expect(result).toEqual({
                organizations: [organization],
                realms: [{ realm: organization.realm }],
            });
            expect(calls).toContainEqual([
                {
                    where: { id: { $in: [ORGANIZATION_ID] }, owner: { account: ACTOR_ID } },
                    options: {
                        lockMode: LockMode.PESSIMISTIC_WRITE,
                        orderBy: { id: "ASC" },
                        refresh: true,
                    },
                    transaction: transaction.entityManager,
                },
            ]);
            await expect(result1).rejects.toThrow("services.organization.ORGANIZATIONS_NOT_FOUND");
        });
    });

    describe("[Method] - purge", () => {
        it("[case] - checks purge eligibility and removes revoked organizations", async () => {
            // Arrange
            const organization = helpers.createOrganization({
                id: ORGANIZATION_ID,
                status: OrganizationStatus.REVOKED,
            });
            const { service, transaction } = helpers.service({
                organizations: [organization],
            });
            const canPurgeSpy = jest.spyOn(organization, "canPurge");

            // Act
            const result = await service.purge({
                transaction: transaction.entityManager,
                identifiers: [ORGANIZATION_ID],
                actor: ACTOR_ID,
                global: false,
            });

            // Assert
            expect(result).toEqual({
                organizations: [organization],
                realms: [{ realm: organization.realm }],
            });
            expect(canPurgeSpy).toHaveBeenCalledTimes(1);
            expect(transaction.remove.mock.calls).toEqual([[[organization]]]);
        });
    });

    describe("[Behavior] - organization deletion", () => {
        it.each(["purge", "purgeOwned"] as const)(
            "[case] - rejects %s while a child process is pending",
            async (method) => {
                // Arrange
                const organization = helpers.createOrganization({ status: OrganizationStatus.REVOKED });
                const { service, transaction, hasPendingProcesses } = helpers.service({ organizations: [organization] });
                hasPendingProcesses.mockResolvedValue(true);

                // Act
                const result = service[method]({
                    identifiers: [organization.id],
                    account: ACTOR_ID,
                    actor: ACTOR_ID,
                    global: false,
                    transaction: transaction.entityManager,
                });

                // Assert
                await expect(result).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
                expect(hasPendingProcesses).toHaveBeenCalledWith({
                    identifiers: [organization.id],
                    transaction: transaction.entityManager,
                });
                expect(transaction.remove).not.toHaveBeenCalled();
            },
        );

        it("[case] - rejects owner cleanup while the organization itself has a pending process", async () => {
            // Arrange
            const organization = helpers.createOrganization({ process: "pending-process" });
            const { service, transaction } = helpers.service({ organizations: [organization] });

            // Act
            const result = service.purgeOwned({ account: ACTOR_ID, transaction: transaction.entityManager });

            // Assert
            await expect(result).rejects.toThrow("services.workflow.OPERATION_CONFLICT");
            expect(transaction.remove).not.toHaveBeenCalled();
        });
    });
});
