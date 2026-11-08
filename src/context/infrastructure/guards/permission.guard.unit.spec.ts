import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { context as apiContext, SpanStatusCode, trace } from "@opentelemetry/api";
import { HttpStatus } from "@nestjs/common";

import { REQUIRE_GLOBAL_PERMISSION, REQUIRE_PERMISSION, IS_PUBLIC } from "~common/decorators/tokens";
import { GuardUnitHelpers } from "~testing/unit/guards/guard.helpers";
import { PermissionCode, PrivilegeScope } from "~context/enums";
import { SYSTEM_REALM_ID } from "~context/constants";

/* eslint-disable prettier/prettier */
const ACCOUNT_ID = "00000000-0000-4000-8000-100000000001";
const REALM_ID   = "00000000-0000-4000-8000-100000000002";
/* eslint-enable prettier/prettier */

const PERMISSION = PermissionCode.REALM_READ_ABSOLUTE;
const SECOND_PERMISSION = PermissionCode.REALM_UPDATE;

const helpers = new GuardUnitHelpers();

beforeAll(() => helpers.initialize());

describe("[Guard] - Permission", () => {
    describe("[Method] - canActivate", () => {
        it.each(["public", "unrestricted"] as const)(
            "[case] - allows %s handlers without permission lookups",
            async (scenario) => {
                // Arrange
                const { guard, checkPermissions } = helpers.permission();
                const handlerMetadata: [symbol, unknown][] = scenario === "public" ? [[IS_PUBLIC, true]] : [];
                const context = helpers.context({ request: helpers.request(), handlerMetadata });

                // Act
                const result = guard.canActivate(context);
                const result1 = await result;

                // Assert
                expect(result1).toBe(true);
                expect(checkPermissions).not.toHaveBeenCalled();
            },
        );

        it("[case] - requires an authenticated account before looking up permissions", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const context = helpers.context({
                request: helpers.request({ session: { realms: [REALM_ID] } }),
                handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]],
            });

            // Act
            const result = guard.canActivate(context);

            // Assert
            await expect(result).rejects.toMatchObject({
                message: "guard.permission.ACCOUNT_REQUIRED",
                statusCode: HttpStatus.FORBIDDEN,
            });
            expect(checkPermissions).not.toHaveBeenCalled();
        });

        it("[case] - rejects an empty requested realm", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const request = helpers.request({ query: { realm: "" }, session: { account: ACCOUNT_ID, realms: [REALM_ID] } });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );

            // Assert
            await expect(result).rejects.toMatchObject({ message: "guard.permission.REALM_REQUIRED" });
            expect(checkPermissions).not.toHaveBeenCalled();
        });

        it.each([
            { scope: "system", realms: [SYSTEM_REALM_ID] },
            { scope: "requested", realms: [REALM_ID] },
            { scope: "empty", realms: [] },
        ])("[case] - accepts a global grant with $scope session scope", async ({ realms }) => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission({ matched: { [PERMISSION]: PrivilegeScope.GLOBAL } });
            const request = helpers.request({ query: { realm: REALM_ID }, session: { account: ACCOUNT_ID, realms } });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );
            const result1 = await result;

            // Assert
            expect(result1).toBe(true);
            expect(checkPermissions.mock.calls).toEqual([
                [
                    {
                        globalOnly: !realms.includes(REALM_ID),
                        permissions: [PERMISSION],
                        account: ACCOUNT_ID,
                        realm: REALM_ID,
                    },
                ],
            ]);
            expect(request.metadata.permissions).toEqual({ [PERMISSION]: PrivilegeScope.GLOBAL });
        });

        it("[case] - does not search realm grants outside the session scope", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const request = helpers.request({
                query: { realm: REALM_ID },
                session: { account: ACCOUNT_ID, realms: [SYSTEM_REALM_ID] },
            });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );

            // Assert
            await expect(result).rejects.toMatchObject({ message: "guard.permission.INSUFFICIENT_PERMISSIONS" });
            expect(checkPermissions.mock.calls).toEqual([
                [
                    {
                        globalOnly: true,
                        permissions: [PERMISSION],
                        account: ACCOUNT_ID,
                        realm: REALM_ID,
                    },
                ],
            ]);
            expect(request.metadata).toEqual({});
        });

        it("[case] - requires session realm scope when no global grant exists", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const request = helpers.request({ session: { account: ACCOUNT_ID } });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );

            // Assert
            await expect(result).rejects.toMatchObject({ message: "guard.permission.INSUFFICIENT_PERMISSIONS" });
            expect(checkPermissions).toHaveBeenCalledTimes(1);
        });

        it("[case] - checks realm grants with a global fallback in one lookup", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission({ matched: { [PERMISSION]: PrivilegeScope.REALM } });
            const request = helpers.request({
                query: { realm: REALM_ID },
                session: { account: ACCOUNT_ID, realms: [SYSTEM_REALM_ID, REALM_ID] },
            });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, classMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );
            const result1 = await result;

            // Assert
            expect(result1).toBe(true);
            expect(checkPermissions.mock.calls).toEqual([
                [{ globalOnly: false, permissions: [PERMISSION], account: ACCOUNT_ID, realm: REALM_ID }],
            ]);
            expect(request.metadata.permissions).toEqual({ [PERMISSION]: PrivilegeScope.REALM });
        });

        it("[case] - rejects when neither global nor requested realm grants match", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const request = helpers.request({
                query: { realm: REALM_ID },
                session: { account: ACCOUNT_ID, realms: [REALM_ID] },
            });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] }),
            );

            // Assert
            await expect(result).rejects.toMatchObject({ message: "guard.permission.INSUFFICIENT_PERMISSIONS" });
            expect(checkPermissions).toHaveBeenCalledTimes(1);
        });

        it("[case] - allows manage with a global grant without requiring a direct system login", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission({
                matched: { [SECOND_PERMISSION]: PrivilegeScope.GLOBAL },
            });
            const request = helpers.request({
                query: { realm: REALM_ID },
                session: { account: ACCOUNT_ID, realms: [REALM_ID] },
            });
            const context = helpers.context({
                request,
                handlerMetadata: [
                    [REQUIRE_PERMISSION, [PERMISSION]],
                    [REQUIRE_GLOBAL_PERMISSION, [SECOND_PERMISSION]],
                ],
            });

            // Act
            const result = guard.canActivate(context);
            const result1 = await result;

            // Assert
            expect(result1).toBe(true);
            expect(checkPermissions.mock.calls).toEqual([
                [
                    {
                        globalOnly: true,
                        permissions: [SECOND_PERMISSION],
                        account: ACCOUNT_ID,
                        realm: SYSTEM_REALM_ID,
                    },
                ],
            ]);
        });

        it("[case] - never falls back to realm grants for manage", async () => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            checkPermissions.mockResolvedValueOnce({}).mockResolvedValue({ [PERMISSION]: PrivilegeScope.REALM });
            const request = helpers.request({ session: { account: ACCOUNT_ID, realms: [SYSTEM_REALM_ID] } });

            // Act
            const result = guard.canActivate(
                helpers.context({ request, handlerMetadata: [[REQUIRE_GLOBAL_PERMISSION, [PERMISSION]]] }),
            );

            // Assert
            await expect(result).rejects.toMatchObject({ message: "guard.permission.INSUFFICIENT_PERMISSIONS" });
            expect(checkPermissions).toHaveBeenCalledTimes(1);
        });

        it.each([true, false])("[case] - fails closed on lookup errors (globalOnly=%s)", async (globalOnly) => {
            // Arrange
            const { guard, checkPermissions } = helpers.permission();
            const error = new Error("permission cache unavailable");
            checkPermissions.mockRejectedValueOnce(error);
            const request = helpers.request({
                query: { realm: REALM_ID },
                session: { account: ACCOUNT_ID, realms: [REALM_ID] },
            });

            // Act
            const result = guard.canActivate(
                helpers.context({
                    request,
                    handlerMetadata: [[globalOnly ? REQUIRE_GLOBAL_PERMISSION : REQUIRE_PERMISSION, [PERMISSION]]],
                }),
            );

            // Assert
            await expect(result).rejects.toBe(error);
            expect(request.metadata).toEqual({});
        });
    });

    describe("[Behavior] - tracing", () => {
        const { sdk, exporter } = helpers.tracing();

        beforeAll(() => sdk.start());
        afterEach(() => exporter.reset());
        afterAll(async () => {
            await sdk.shutdown();
            trace.disable();
            apiContext.disable();
        });

        it("[case] - finishes one span when the guard allows the request", async () => {
            // Arrange
            const { guard } = helpers.permission();
            const context = helpers.context({ request: helpers.request(), handlerMetadata: [[IS_PUBLIC, true]] });

            // Act
            const result = await guard.canActivate(context);

            // Assert
            expect(result).toBe(true);
            expect(exporter.getFinishedSpans()).toHaveLength(1);
            expect(exporter.getFinishedSpans()[0]).toMatchObject({
                name: "guard.permission",
                status: { code: SpanStatusCode.UNSET },
                attributes: {},
                events: [],
                ended: true,
            });
        });

        it("[case] - preserves the failure and finishes the span without private data", async () => {
            // Arrange
            const error = new Error("private dependency failure");
            const { guard, checkPermissions } = helpers.permission();
            const request = helpers.request({
                session: { account: ACCOUNT_ID, realms: [REALM_ID] },
                query: { realm: REALM_ID },
            });
            checkPermissions.mockRejectedValueOnce(error);
            const context = helpers.context({ request, handlerMetadata: [[REQUIRE_PERMISSION, [PERMISSION]]] });

            // Act
            const result = guard.canActivate(context);

            // Assert
            await expect(result).rejects.toBe(error);
            expect(exporter.getFinishedSpans()).toHaveLength(1);
            expect(exporter.getFinishedSpans()[0]).toMatchObject({
                name: "guard.permission",
                status: { code: SpanStatusCode.ERROR },
                attributes: {},
                events: [],
                ended: true,
            });
        });
    });
});
