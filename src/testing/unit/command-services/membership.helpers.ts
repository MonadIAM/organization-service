import { jest } from "@jest/globals";

import { MembershipCommands } from "~context/application/commands/membership.commands";

import { ApplicationCommandUnitHelpers } from "./core.helpers";

export class MembershipCommandsUnitHelpers
    extends ApplicationCommandUnitHelpers
    implements Unit.Commands.Membership.Contract
{
    public commands(): Unit.Commands.Membership.Commands.Result {
        const execution = this.execution();

        const membershipService = {
            completeEnsure: jest.fn<Services.Membership.CommandContract["completeEnsure"]>(),
            ensure: jest.fn<Services.Membership.CommandContract["ensure"]>(),
            suspend: jest.fn<Services.Membership.CommandContract["suspend"]>(),
            resume: jest.fn<Services.Membership.CommandContract["resume"]>(),
            leave: jest.fn<Services.Membership.CommandContract["leave"]>(),
            block: jest.fn<Services.Membership.CommandContract["block"]>(),
            join: jest.fn<Services.Membership.CommandContract["join"]>(),
        };

        return {
            ...execution,
            membershipService,
            commands: new MembershipCommands(
                execution.transactional,
                this.contract<Services.Membership.CommandContract>(membershipService),
            ),
        };
    }
}
