import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { MembershipMapper } from "./membership.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new MembershipMapper();

describe("[DataMapper] - Membership", () => {
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
