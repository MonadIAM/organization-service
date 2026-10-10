import { describe, expect, it } from "@jest/globals";

import { SYSTEM_ACCOUNT_ID } from "~context/constants";

import { AccountMapper } from "./account.mapper";

const mapper = new AccountMapper();

describe("[DataMapper] - Account", () => {
    describe("[Behavior] - purge payloads", () => {
        it("[case] - separates owned realm purge from account access purge in foreign realms", () => {
            // Arrange
            const result = {
                realms: [{ realm: "owned" }],
                access: [{ realm: "foreign", account: "account" }],
            };

            // Act
            const realms = mapper.realmPurgePayload(result);
            const access = mapper.accessPurgePayload(result);

            // Assert
            expect(realms).toEqual([{ actor: SYSTEM_ACCOUNT_ID, realm: "owned" }]);
            expect(access).toEqual([
                {
                    actor: SYSTEM_ACCOUNT_ID,
                    realm: "foreign",
                    input: { account: "account" },
                },
            ]);
        });
    });
});
