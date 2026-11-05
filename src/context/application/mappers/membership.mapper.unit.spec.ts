import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { MembershipMapper } from "./membership.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new MembershipMapper();

describe("[DataMapper] - Membership", () => {
    describe("[Behavior] - HR ensure payloads", () => {
        it("[case] - preserves both correlation IDs when used as an unbound outbox mapper", () => {
            // Arrange
            const membership = helpers.createMembership();
            membership.beginJoin();
            const request = {
                actor: "actor",
                realm: membership.organization.realm,
                input: { organization: membership.organization.id, account: membership.account, process: "hr-request" },
            };
            const { ensureJoin, ensureConfirmed, ensureRejected } = mapper;

            // Act
            const pending = ensureJoin({ membership, request });
            const before = ensureConfirmed({ membership, request });
            membership.confirmJoin(new Date());
            const confirmed = ensureConfirmed({ membership, request });
            const after = ensureJoin({ membership, request });
            const rejected = ensureRejected({ request, reason: "membership blocked" });

            // Assert
            expect(pending[0].input).toMatchObject({ hrRequest: "hr-request", membership: membership.id });
            expect(pending[0].input.process).not.toBe("hr-request");
            expect(pending[0].input.command).toBe(pending[0].input.process);
            expect(pending[0].input.role).toBeUndefined();
            expect(before).toEqual([]);
            expect(after).toEqual([]);
            expect(confirmed).toEqual([request]);
            expect(rejected).toEqual([{ ...request, input: { ...request.input, reason: "membership blocked" } }]);
        });
    });

    describe("[Method] - joinPayload", () => {
        it("[case] - requests the default role with membership correlation", () => {
            // Arrange
            const membership = helpers.createMembership();
            membership.beginJoin();

            // Act
            const payload = mapper.joinPayload({ membership, actor: "actor" });

            // Assert
            expect(payload.input.membership).toBe(membership.id);
            expect(payload.input.process).toBe(membership.process);
            expect(payload.input.command).toBe(membership.process);
            expect(payload.input.role).toBeUndefined();
            expect(payload.realm).toBe(membership.organization.realm);
        });
    });

    describe("[Method] - accessPayload", () => {
        it("[case] - preserves every account-realm target", () => {
            // Arrange
            const membership = helpers.createMembership();
            const access = ["organization-realm", "project-realm"].map((realm) => ({
                realm,
                account: membership.account,
            }));

            // Act
            const payloads = mapper.accessPayload({ memberships: [membership], access, actor: "actor" });

            // Assert
            expect(payloads).toEqual(access.map(({ realm, ...input }) => ({ realm, actor: "actor", input })));
        });
    });
});
