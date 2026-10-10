import { describe, expect, it } from "@jest/globals";

import { PositionMapper } from "./position.mapper";

const mapper = new PositionMapper();
const REQUEST: Topics.Position.PlacementRequestedMessage["payload"] = {
    actor: "actor-account",
    realm: "organization-realm",
    input: {
        organization: "organization-a",
        process: "placement-process",
        department: "department-a",
        position: "position-a",
        team: "team-a",
    },
};

describe("[DataMapper] - Position", () => {
    describe("[Method] - confirmed", () => {
        it("[case] - preserves the caller, hierarchy and process for confirmation", () => {
            // Arrange
            const request = { ...REQUEST, input: { ...REQUEST.input } };

            // Act
            const result = mapper.confirmed({ request });

            // Assert
            expect(result).toEqual(REQUEST);
        });
    });

    describe("[Method] - rejected", () => {
        it("[case] - adds the rejection reason without mutating the original request", () => {
            // Arrange
            const request = { ...REQUEST, input: { ...REQUEST.input } };
            const reason = "team not found";

            // Act
            const result = mapper.rejected({ request, reason });

            // Assert
            expect(result).toEqual({ ...REQUEST, input: { ...REQUEST.input, reason } });
            expect(request).toEqual(REQUEST);
            expect(request.input).not.toHaveProperty("reason");
        });
    });
});
