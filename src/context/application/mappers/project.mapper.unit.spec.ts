import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { ProjectMapper } from "./project.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new ProjectMapper();

describe("[DataMapper] - Project", () => {
    describe("[Method] - bootstrapPayload", () => {
        it("[case] - keeps the project realm distinct from the parent organization realm", () => {
            // Arrange
            const organization = helpers.createOrganization();
            const project = helpers.createProject({ organization, realm: "project-realm" });
            project.beginBootstrap();

            // Act
            const payload = mapper.bootstrapPayload({ project, actor: "creator" });

            // Assert
            expect(payload.realm).toBe("project-realm");
            expect(payload.actor).toBe("creator");
            expect(payload.input.organizationRealm).toBe(organization.realm);
            expect(payload.input.owner).toBe(organization.owner.account);
            expect(payload.input.process).toBe(project.process);
            expect(payload.input.resource).toBe(project.id);
        });
    });
});
