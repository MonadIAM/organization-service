import { describe, expect, it } from "@jest/globals";

import { EntityFactoryRegistry } from "~testing/entity-factory.registry";
import { PositionReferenceType } from "~context/enums";

import { TeamMapper } from "./team.mapper";

const helpers = new EntityFactoryRegistry();
const mapper = new TeamMapper();
const REALM = "organization-realm";
const POSITION = "position-a";
const ACTOR = "actor-account";

describe("[DataMapper] - Team", () => {
    describe("[Method] - referencePayload", () => {
        it("[case] - maps the current position, hierarchy and process without exposing rollback state", () => {
            // Arrange
            const team = helpers.createTeam();
            team.assignLead({ position: "previous-position" });
            team.completePosition(false);
            team.assignLead({ position: POSITION });

            // Act
            const result = mapper.referencePayload({ team, actor: ACTOR, realm: REALM });

            // Assert
            expect(result).toEqual([
                {
                    actor: ACTOR,
                    realm: REALM,
                    input: {
                        type: PositionReferenceType.TEAM_LEAD,
                        organization: team.organization.id,
                        department: team.department.id,
                        team: team.id,
                        position: POSITION,
                        process: team.process,
                    },
                },
            ]);
            expect(team.previousPosition).toBe("previous-position");
        });

        it("[case] - does not request validation for a confirmed reference", () => {
            // Arrange
            const team = helpers.createTeam();
            team.assignLead({ position: POSITION });
            team.completePosition(false);

            // Act
            const result = mapper.referencePayload({ team, actor: ACTOR, realm: REALM });

            // Assert
            expect(result).toEqual([]);
            expect(team.leadPosition).toBe(POSITION);
        });

        it("[case] - does not request validation after the reference is removed", () => {
            // Arrange
            const team = helpers.createTeam();
            team.assignLead({ position: POSITION });
            team.unassignLead();

            // Act
            const result = mapper.referencePayload({ team, actor: ACTOR, realm: REALM });

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe("[Method] - purgePayload", () => {
        it("[case] - keeps each deleted team associated with its own organization", () => {
            // Arrange
            const first = helpers.createTeam();
            const second = helpers.createTeam();

            // Act
            const result = mapper.purgePayload({ teams: [first, second], actor: ACTOR, realm: REALM });

            // Assert
            expect(result).toEqual([
                { actor: ACTOR, realm: REALM, input: { organization: first.organization.id, team: first.id } },
                { actor: ACTOR, realm: REALM, input: { organization: second.organization.id, team: second.id } },
            ]);
        });

        it("[case] - does not emit cleanup events when no entities were removed", () => {
            // Arrange
            const teams: Entities.Team[] = [];

            // Act
            const result = mapper.purgePayload({ teams, actor: ACTOR, realm: REALM });

            // Assert
            expect(result).toEqual([]);
        });
    });
});
