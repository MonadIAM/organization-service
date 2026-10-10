import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { OrganizationMapper } from "./organization.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new OrganizationMapper();

describe("[DataMapper] - Organization", () => {
    describe("[Method] - bootstrapPayload", () => {
        it("[case] - maps bootstrap correlation and the owner's account", () => {
            // Arrange
            const organization = helpers.createOrganization();
            const membership = organization.owner;
            organization.beginBootstrap();

            // Act
            const payload = mapper.bootstrapPayload({ organization, membership });

            // Assert
            expect(payload.realm).toBe(organization.realm);
            expect(payload.actor).toBe(membership.account);
            expect(payload.input).toEqual({
                resource: organization.id,
                process: organization.process,
                owner: membership.account,
                name: organization.title,
                description: organization.description,
            });
        });
    });

    describe("[Method] - lifecyclePayload", () => {
        it("[case] - maps every affected realm", () => {
            // Arrange
            const organization = helpers.createOrganization();
            const realms = [organization.realm, "project-realm"].map((realm) => ({
                realm,
            }));

            // Act
            const payloads = mapper.lifecyclePayload({ organizations: [organization], realms, actor: "actor" });

            // Assert
            expect(payloads).toEqual(realms.map(({ realm }) => ({ realm, actor: "actor" })));
        });
    });
});
