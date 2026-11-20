import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";

import { ProjectAccountAssignmentMapper } from "./project-account-assignment.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new ProjectAccountAssignmentMapper();

describe("[DataMapper] - ProjectAccountAssignment", () => {
    it("[case] - joins the project realm using the organization's existing membership", () => {
        const assignment = helpers.createProjectAccountAssignment();
        assignment.project.realm = "project-realm";
        assignment.organization.realm = "organization-realm";

        const payload = mapper.join(assignment, "actor");

        expect(payload).toEqual({
            actor: "actor",
            realm: "project-realm",
            input: {
                membership: assignment.membership.id,
                account: assignment.membership.account,
                process: assignment.id,
                command: assignment.id,
            },
        });
    });

    it("[case] - scopes access lifecycle events to each affected project and account", () => {
        const assignments = [helpers.createProjectAccountAssignment(), helpers.createProjectAccountAssignment()];
        assignments[0].project.realm = "first-project";
        assignments[1].project.realm = "second-project";

        expect(mapper.access(assignments, "actor")).toEqual(
            assignments.map((assignment) => ({
                actor: "actor",
                realm: assignment.project.realm,
                input: { account: assignment.membership.account },
            })),
        );
    });
});
